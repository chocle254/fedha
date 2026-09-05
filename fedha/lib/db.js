// Offline-first data layer, backed by Supabase with a local IndexedDB
// mirror (lib/offline-cache.js) for instant reads and resilient writes.
// Same exported function names and shapes as before on purpose, so
// AppContext.js and every page that imports from here needed zero changes.
//
// Pattern used throughout:
//   READS  (getX):  return the local cache immediately; if online, kick off
//                    a background refetch that updates the cache for next
//                    time and fires 'fedha:db-changed' so the UI can
//                    silently pick up server-side changes.
//   WRITES (saveX/deleteX): apply to the local cache synchronously (so the
//                    UI updates instantly, online or off), enqueue the
//                    matching Supabase operation(s), and return the
//                    locally-computed result without waiting on the network.
//
// Every write goes through Postgres RLS scoped to auth.uid(), so once
// synced this only ever touches the signed-in user's own rows.

import { supabase, isSupabaseEnabled } from './supabase';
import {
  cacheGetAll, cacheGet, cachePut, cachePutMany, cacheDelete, cacheReplaceAll,
  cacheGetSetting, cachePutSetting, enqueueOp,
} from './offline-cache';
import { flushPendingOps } from './sync-engine';

function logErr(action, err) {
  if (err) console.error(`[fedha] ${action} failed:`, err.message);
  return err;
}

function isOnline() {
  return typeof navigator === 'undefined' || navigator.onLine;
}

function notifyChanged(table) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('fedha:db-changed', { detail: { table } }));
  }
}

// Simple id generator for records created while offline (mirrors the one
// in lib/utils.js — duplicated here to avoid a circular import, since
// utils.js doesn't need to know about the offline cache).
function localId() {
  return 'local_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}

// Background refresh: fetch fresh rows for a table, replace the local
// mirror, and notify listeners if anything actually changed. Never throws —
// a failed background refresh just means we keep serving the existing
// cache, which is the whole point of being offline-first.
async function refreshTable(table, buildQuery) {
  if (!isOnline() || !isSupabaseEnabled()) return;
  try {
    const { data, error } = await buildQuery();
    if (error) throw error;
    await cacheReplaceAll(table, data || []);
    notifyChanged(table);
  } catch (e) {
    console.warn(`[fedha] background refresh of ${table} failed (offline?):`, e?.message);
  }
}

// ─── SETTINGS (key/value) ────────────────────────────────────────────────────
export async function getSetting(key, fallback = null) {
  if (!isSupabaseEnabled()) return fallback;
  const cached = await cacheGetSetting(key);

  // Fire-and-forget background refresh so next read reflects the server.
  if (isOnline()) {
    (async () => {
      try {
        const { data, error } = await supabase.from('settings').select('value').eq('key', key).maybeSingle();
        if (error) throw error;
        if (data) { await cachePutSetting(key, data.value); notifyChanged('settings'); }
      } catch (e) { console.warn('[fedha] background getSetting refresh failed:', key, e?.message); }
    })();
  }

  return cached !== undefined ? cached : fallback;
}
export async function setSetting(key, value) {
  if (!isSupabaseEnabled()) return;
  await cachePutSetting(key, value);
  await enqueueOp({
    kind: 'upsert',
    table: 'settings',
    id: `setting:${key}`,
    payload: { key, value, updated_at: new Date().toISOString() },
    onConflict: 'user_id,key',
  });
  flushPendingOps();
}

// ─── WALLETS ─────────────────────────────────────────────────────────────────
export async function getWallets() {
  const cached = await cacheGetAll('wallets');
  refreshTable('wallets', () => supabase.from('wallets').select('*').order('created_at', { ascending: true }));
  return cached.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}
export async function saveWallet(wallet) {
  const record = { ...wallet, id: wallet.id || localId(), updated_at: new Date().toISOString() };
  await cachePut('wallets', record);
  await enqueueOp({ kind: 'upsert', table: 'wallets', id: record.id, payload: record });
  flushPendingOps();
  return record;
}
export async function deleteWallet(id) {
  await cacheDelete('wallets', id);
  await enqueueOp({ kind: 'delete', table: 'wallets', id });
  flushPendingOps();
}

// ─── TRANSACTIONS ─────────────────────────────────────────────────────────────
export async function getTransactions(filters = {}) {
  let all = await cacheGetAll('transactions');
  if (filters.wallet_id) all = all.filter((t) => t.wallet_id === filters.wallet_id);
  if (filters.type) all = all.filter((t) => t.type === filters.type);
  if (filters.category) all = all.filter((t) => t.category === filters.category);
  if (filters.from_date) all = all.filter((t) => t.date >= filters.from_date);
  if (filters.to_date) all = all.filter((t) => t.date <= filters.to_date);
  // Only refresh the unfiltered, full table in the background — filtering
  // happens locally against the cache either way, so we always want the
  // complete set cached, not just whatever this one call filtered for.
  refreshTable('transactions', () => supabase.from('transactions').select('*').order('date', { ascending: false }));
  return all.sort((a, b) => new Date(b.date) - new Date(a.date));
}

export async function saveTransaction(tx) {
  const now = new Date().toISOString();
  const record = { ...tx, id: tx.id || localId(), updated_at: now };
  await cachePut('transactions', record);
  await enqueueOp({ kind: 'upsert', table: 'transactions', id: record.id, payload: record });

  // Mirror the exact same wallet-balance and budget-spent cascade that
  // Supabase will eventually apply, against the local cache, so the UI
  // reflects the correct numbers immediately — then queue each affected
  // row as its own upsert so the same end state gets replayed on sync.
  const wallet = await cacheGet('wallets', tx.wallet_id);
  if (wallet) {
    const balance = (Number(wallet.balance) || 0) + (tx.type === 'income' ? Number(tx.amount) : -Number(tx.amount));
    const updatedWallet = { ...wallet, balance, updated_at: now };
    await cachePut('wallets', updatedWallet);
    await enqueueOp({ kind: 'upsert', table: 'wallets', id: wallet.id, payload: updatedWallet });
  }
  if (tx.type === 'transfer' && tx.to_wallet_id) {
    const toW = await cacheGet('wallets', tx.to_wallet_id);
    if (toW) {
      const updatedToW = { ...toW, balance: (Number(toW.balance) || 0) + Number(tx.amount), updated_at: now };
      await cachePut('wallets', updatedToW);
      await enqueueOp({ kind: 'upsert', table: 'wallets', id: toW.id, payload: updatedToW });
    }
  }
  if (tx.type === 'expense' && tx.category) {
    const budgets = await cacheGetAll('budgets');
    const budget = budgets.find((b) => b.category === tx.category);
    if (budget) {
      const updatedBudget = { ...budget, spent: (Number(budget.spent) || 0) + Number(tx.amount), updated_at: now };
      await cachePut('budgets', updatedBudget);
      await enqueueOp({ kind: 'upsert', table: 'budgets', id: budget.id, payload: updatedBudget });
    }
  }

  notifyChanged('transactions'); notifyChanged('wallets'); notifyChanged('budgets');
  flushPendingOps();
  return record;
}

export async function deleteTransaction(id) {
  const now = new Date().toISOString();
  const tx = await cacheGet('transactions', id);
  await cacheDelete('transactions', id);
  await enqueueOp({ kind: 'delete', table: 'transactions', id });
  if (!tx) { flushPendingOps(); return; }

  const wallet = await cacheGet('wallets', tx.wallet_id);
  if (wallet) {
    const balance = (Number(wallet.balance) || 0) + (tx.type === 'income' ? -Number(tx.amount) : Number(tx.amount));
    const updatedWallet = { ...wallet, balance, updated_at: now };
    await cachePut('wallets', updatedWallet);
    await enqueueOp({ kind: 'upsert', table: 'wallets', id: wallet.id, payload: updatedWallet });
  }
  if (tx.type === 'transfer' && tx.to_wallet_id) {
    const toW = await cacheGet('wallets', tx.to_wallet_id);
    if (toW) {
      const updatedToW = { ...toW, balance: (Number(toW.balance) || 0) - Number(tx.amount), updated_at: now };
      await cachePut('wallets', updatedToW);
      await enqueueOp({ kind: 'upsert', table: 'wallets', id: toW.id, payload: updatedToW });
    }
  }
  if (tx.type === 'expense' && tx.category) {
    const budgets = await cacheGetAll('budgets');
    const budget = budgets.find((b) => b.category === tx.category);
    if (budget) {
      const updatedBudget = { ...budget, spent: Math.max(0, (Number(budget.spent) || 0) - Number(tx.amount)), updated_at: now };
      await cachePut('budgets', updatedBudget);
      await enqueueOp({ kind: 'upsert', table: 'budgets', id: budget.id, payload: updatedBudget });
    }
  }

  notifyChanged('transactions'); notifyChanged('wallets'); notifyChanged('budgets');
  flushPendingOps();
}

// ─── Small helper for the plain structured tables ───────────────────────────
function structuredStore(table) {
  return {
    async getAll() {
      const cached = await cacheGetAll(table);
      refreshTable(table, () => supabase.from(table).select('*').order('created_at', { ascending: true }));
      return cached.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    },
    async save(record) {
      const row = { ...record, id: record.id || localId(), updated_at: new Date().toISOString() };
      await cachePut(table, row);
      await enqueueOp({ kind: 'upsert', table, id: row.id, payload: row });
      notifyChanged(table);
      flushPendingOps();
      return row;
    },
    async remove(id) {
      await cacheDelete(table, id);
      await enqueueOp({ kind: 'delete', table, id });
      notifyChanged(table);
      flushPendingOps();
    },
  };
}

const budgetsStore = structuredStore('budgets');
export const getBudgets = () => budgetsStore.getAll();
export const saveBudget = (b) => budgetsStore.save(b);
export const deleteBudget = (id) => budgetsStore.remove(id);

const loansStore = structuredStore('loans');
export const getLoans = () => loansStore.getAll();
export const saveLoan = (l) => loansStore.save(l);
export const deleteLoan = (id) => loansStore.remove(id);

const goalsStore = structuredStore('goals');
export const getGoals = () => goalsStore.getAll();
export const saveGoal = (g) => goalsStore.save(g);
export const deleteGoal = (id) => goalsStore.remove(id);

const incomePlansStore = structuredStore('income_plans');
export const getIncomePlans = () => incomePlansStore.getAll();
export const saveIncomePlan = (p) => incomePlansStore.save(p);
export const deleteIncomePlan = (id) => incomePlansStore.remove(id);

// ─── Generic JSONB-backed stores (id + optional lifted column + data) ──────
// Mirrors the old schemaless IndexedDB stores — new fields (like Tech Hub's
// project status/progress/notes) just live in `data`, no SQL migration.
//
// The local cache stores the flattened record shape (what every caller
// actually works with) so reads never need the row<->record conversion.
// That conversion only happens right at the Supabase boundary, inside the
// background refresh and inside the queued payload for writes.
function jsonStore(table, liftField) {
  function rowToRecord(row) {
    const { data, ...core } = row;
    const record = { ...core, ...(data || {}) };
    delete record.user_id;
    return record;
  }
  function recordToRow(record) {
    const { id, created_at, updated_at, user_id, ...rest } = record;
    const row = { id, created_at, updated_at: new Date().toISOString() };
    if (liftField && rest[liftField] !== undefined) { row[liftField] = rest[liftField]; delete rest[liftField]; }
    row.data = rest;
    return row;
  }
  return {
    async getAll(filterValue) {
      const cached = await cacheGetAll(table);
      const filtered = liftField && filterValue !== undefined
        ? cached.filter((r) => r[liftField] === filterValue)
        : cached;

      if (isOnline() && isSupabaseEnabled()) {
        (async () => {
          try {
            let q = supabase.from(table).select('*');
            const { data, error } = await q;
            if (error) throw error;
            await cacheReplaceAll(table, (data || []).map(rowToRecord));
            notifyChanged(table);
          } catch (e) { console.warn(`[fedha] background refresh of ${table} failed (offline?):`, e?.message); }
        })();
      }
      return filtered;
    },
    async save(record) {
      const withId = { ...record, id: record.id || localId(), created_at: record.created_at || new Date().toISOString() };
      const flatRecord = { ...withId, updated_at: new Date().toISOString() };
      await cachePut(table, flatRecord);
      await enqueueOp({ kind: 'upsert', table, id: flatRecord.id, payload: recordToRow(flatRecord) });
      notifyChanged(table);
      flushPendingOps();
      return flatRecord;
    },
    async remove(id) {
      await cacheDelete(table, id);
      await enqueueOp({ kind: 'delete', table, id });
      notifyChanged(table);
      flushPendingOps();
    },
  };
}

// ─── FOOD LOGS ───────────────────────────────────────────────────────────────
const foodLogsStore = jsonStore('food_logs', 'date');
export async function getFoodLogs(date) {
  const all = await foodLogsStore.getAll(date);
  return all.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}
export const saveFoodLog = (entry) => foodLogsStore.save(entry);
export const deleteFoodLog = (id) => foodLogsStore.remove(id);

// ─── CHALLENGES ──────────────────────────────────────────────────────────────
const challengesStore = jsonStore('challenges');
export const getChallenges = () => challengesStore.getAll();
export const saveChallenge = (c) => challengesStore.save(c);
export const deleteChallenge = (id) => challengesStore.remove(id);

// ─── HACKATHONS ──────────────────────────────────────────────────────────────
const hackathonsStore = jsonStore('hackathons', 'deadline');
export const getHackathons = () => hackathonsStore.getAll();
export const saveHackathon = (h) => hackathonsStore.save(h);
export const deleteHackathon = (id) => hackathonsStore.remove(id);

// ─── STARTUPS ────────────────────────────────────────────────────────────────
const startupsStore = jsonStore('startups');
export const getStartups = () => startupsStore.getAll();
export const saveStartup = (s) => startupsStore.save(s);
export const deleteStartup = (id) => startupsStore.remove(id);

// ─── PROJECTS (Showroom) ─────────────────────────────────────────────────────
const projectsStore = jsonStore('projects');
export const getProjects = () => projectsStore.getAll();
export const saveProject = (p) => projectsStore.save(p);
export const deleteProject = (id) => projectsStore.remove(id);

// ─── ONLINE JOBS ─────────────────────────────────────────────────────────────
const onlineJobsStore = jsonStore('online_jobs');
export async function getOnlineJobs() {
  const all = await onlineJobsStore.getAll();
  return all.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}
export const saveOnlineJob = (job) => onlineJobsStore.save(job);
export const deleteOnlineJob = (id) => onlineJobsStore.remove(id);

// ─── SEED DEFAULT DATA ────────────────────────────────────────────────────────
export async function seedDefaultData() {
  const cachedWallets = await cacheGetAll('wallets');
  if (cachedWallets.length) return; // already have wallets locally, nothing to seed

  // Only attempt the server round-trip (and the seed insert) when online —
  // offline on a genuinely fresh install, there's nothing sensible to do
  // but wait until the user is back online to check/seed.
  if (!isOnline() || !isSupabaseEnabled()) return;

  try {
    const { data: existing, error } = await supabase.from('wallets').select('id').limit(1);
    if (error) throw error;
    if (existing && existing.length) {
      // Server already has wallets (e.g. synced from another device) —
      // pull them into the cache instead of seeding duplicates.
      await refreshTable('wallets', () => supabase.from('wallets').select('*').order('created_at', { ascending: true }));
      return;
    }

    const now = new Date().toISOString();
    const defaults = [
      { id: 'mpesa', name: 'M-Pesa', type: 'mobile', balance: 0, currency: 'KES', color: '#10B981', icon: '📱', created_at: now, updated_at: now },
      { id: 'bank', name: 'Bank Account', type: 'bank', balance: 0, currency: 'KES', color: '#3B82F6', icon: '🏦', created_at: now, updated_at: now },
      { id: 'cash', name: 'Cash', type: 'cash', balance: 0, currency: 'KES', color: '#F59E0B', icon: '💵', created_at: now, updated_at: now },
      { id: 'airtel', name: 'Airtel Money', type: 'mobile', balance: 0, currency: 'KES', color: '#EF4444', icon: '📲', created_at: now, updated_at: now },
    ];
    await cachePutMany('wallets', defaults);
    const { error: insErr } = await supabase.from('wallets').insert(defaults);
    logErr('seed insert', insErr);
  } catch (e) {
    console.warn('[fedha] seedDefaultData skipped (offline?):', e?.message);
  }
}

// ─── CERTIFICATES ────────────────────────────────────────────────────────────
const certificatesStore = jsonStore('certificates', 'date_earned');
export async function getCertificates() {
  const all = await certificatesStore.getAll();
  return all.sort((a, b) => new Date(b.date_earned || b.created_at) - new Date(a.date_earned || a.created_at));
}
export const saveCertificate = (c) => certificatesStore.save(c);
export const deleteCertificate = (id) => certificatesStore.remove(id);
