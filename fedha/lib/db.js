// Supabase-backed data layer. This used to be IndexedDB (see git history) —
// same exported function names and shapes on purpose, so AppContext.js and
// every page that imports from here needed zero changes. Every read/write
// goes through Postgres RLS scoped to auth.uid(), so this only ever returns
// or touches the signed-in user's own rows.

import { supabase, isSupabaseEnabled } from './supabase';

function logErr(action, err) {
  if (err) console.error(`[fedha] ${action} failed:`, err.message);
  return err;
}

// ─── SETTINGS (key/value) ────────────────────────────────────────────────────
export async function getSetting(key, fallback = null) {
  if (!isSupabaseEnabled()) return fallback;
  try {
    const { data, error } = await supabase.from('settings').select('value').eq('key', key).maybeSingle();
    if (error) throw error;
    return data ? data.value : fallback;
  } catch (e) { console.error('[fedha] getSetting failed:', key, e?.message); return fallback; }
}
export async function setSetting(key, value) {
  if (!isSupabaseEnabled()) return;
  const { error } = await supabase
    .from('settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
  logErr(`setSetting(${key})`, error);
}

// ─── WALLETS ─────────────────────────────────────────────────────────────────
export async function getWallets() {
  const { data, error } = await supabase.from('wallets').select('*').order('created_at', { ascending: true });
  if (error) { logErr('read wallets', error); return []; }
  return data || [];
}
export async function saveWallet(wallet) {
  const record = { ...wallet, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('wallets').upsert(record).select().single();
  if (error) { logErr('save wallet', error); throw error; }
  return data;
}
export async function deleteWallet(id) {
  const { error } = await supabase.from('wallets').delete().eq('id', id);
  logErr('delete wallet', error);
}

// ─── TRANSACTIONS ─────────────────────────────────────────────────────────────
export async function getTransactions(filters = {}) {
  let q = supabase.from('transactions').select('*');
  if (filters.wallet_id) q = q.eq('wallet_id', filters.wallet_id);
  if (filters.type) q = q.eq('type', filters.type);
  if (filters.category) q = q.eq('category', filters.category);
  if (filters.from_date) q = q.gte('date', filters.from_date);
  if (filters.to_date) q = q.lte('date', filters.to_date);
  const { data, error } = await q.order('date', { ascending: false });
  if (error) { logErr('read transactions', error); return []; }
  return data || [];
}
export async function saveTransaction(tx) {
  const now = new Date().toISOString();
  const record = { ...tx, updated_at: now };
  const { data: saved, error } = await supabase.from('transactions').upsert(record).select().single();
  if (error) { logErr('save transaction', error); throw error; }

  const { data: wallet } = await supabase.from('wallets').select('*').eq('id', tx.wallet_id).maybeSingle();
  if (wallet) {
    const balance = (Number(wallet.balance) || 0) + (tx.type === 'income' ? Number(tx.amount) : -Number(tx.amount));
    await supabase.from('wallets').update({ balance, updated_at: now }).eq('id', wallet.id);
  }
  if (tx.type === 'transfer' && tx.to_wallet_id) {
    const { data: toW } = await supabase.from('wallets').select('*').eq('id', tx.to_wallet_id).maybeSingle();
    if (toW) await supabase.from('wallets').update({ balance: (Number(toW.balance) || 0) + Number(tx.amount), updated_at: now }).eq('id', toW.id);
  }
  if (tx.type === 'expense' && tx.category) {
    const { data: budget } = await supabase.from('budgets').select('*').eq('category', tx.category).maybeSingle();
    if (budget) await supabase.from('budgets').update({ spent: (Number(budget.spent) || 0) + Number(tx.amount), updated_at: now }).eq('id', budget.id);
  }
  return saved;
}
export async function deleteTransaction(id) {
  const now = new Date().toISOString();
  const { data: tx, error } = await supabase.from('transactions').delete().eq('id', id).select().maybeSingle();
  if (error) { logErr('delete transaction', error); return; }
  if (!tx) return;

  const { data: wallet } = await supabase.from('wallets').select('*').eq('id', tx.wallet_id).maybeSingle();
  if (wallet) {
    const balance = (Number(wallet.balance) || 0) + (tx.type === 'income' ? -Number(tx.amount) : Number(tx.amount));
    await supabase.from('wallets').update({ balance, updated_at: now }).eq('id', wallet.id);
  }
  if (tx.type === 'transfer' && tx.to_wallet_id) {
    const { data: toW } = await supabase.from('wallets').select('*').eq('id', tx.to_wallet_id).maybeSingle();
    if (toW) await supabase.from('wallets').update({ balance: (Number(toW.balance) || 0) - Number(tx.amount), updated_at: now }).eq('id', toW.id);
  }
  if (tx.type === 'expense' && tx.category) {
    const { data: budget } = await supabase.from('budgets').select('*').eq('category', tx.category).maybeSingle();
    if (budget) await supabase.from('budgets').update({ spent: Math.max(0, (Number(budget.spent) || 0) - Number(tx.amount)), updated_at: now }).eq('id', budget.id);
  }
}

// ─── Small helper for the plain structured tables ───────────────────────────
function structuredStore(table) {
  return {
    async getAll() {
      const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: true });
      if (error) { logErr(`read ${table}`, error); return []; }
      return data || [];
    },
    async save(record) {
      const row = { ...record, updated_at: new Date().toISOString() };
      const { data, error } = await supabase.from(table).upsert(row).select().single();
      if (error) { logErr(`save ${table}`, error); throw error; }
      return data;
    },
    async remove(id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      logErr(`delete ${table}`, error);
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
      let q = supabase.from(table).select('*');
      if (liftField && filterValue !== undefined) q = q.eq(liftField, filterValue);
      const { data, error } = await q;
      if (error) { logErr(`read ${table}`, error); return []; }
      return (data || []).map(rowToRecord);
    },
    async save(record) {
      const row = recordToRow(record);
      const { data, error } = await supabase.from(table).upsert(row).select().single();
      if (error) { logErr(`save ${table}`, error); throw error; }
      return rowToRecord(data);
    },
    async remove(id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      logErr(`delete ${table}`, error);
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
  const { data: existing, error } = await supabase.from('wallets').select('id').limit(1);
  if (error) { logErr('seed check', error); return; }
  if (existing && existing.length) return;

  const now = new Date().toISOString();
  const defaults = [
    { id: 'mpesa', name: 'M-Pesa', type: 'mobile', balance: 0, currency: 'KES', color: '#10B981', icon: '📱', created_at: now, updated_at: now },
    { id: 'bank', name: 'Bank Account', type: 'bank', balance: 0, currency: 'KES', color: '#3B82F6', icon: '🏦', created_at: now, updated_at: now },
    { id: 'cash', name: 'Cash', type: 'cash', balance: 0, currency: 'KES', color: '#F59E0B', icon: '💵', created_at: now, updated_at: now },
    { id: 'airtel', name: 'Airtel Money', type: 'mobile', balance: 0, currency: 'KES', color: '#EF4444', icon: '📲', created_at: now, updated_at: now },
  ];
  const { error: insErr } = await supabase.from('wallets').insert(defaults);
  logErr('seed insert', insErr);
}

// ─── CERTIFICATES ────────────────────────────────────────────────────────────
const certificatesStore = jsonStore('certificates', 'date_earned');
export async function getCertificates() {
  const all = await certificatesStore.getAll();
  return all.sort((a, b) => new Date(b.date_earned || b.created_at) - new Date(a.date_earned || a.created_at));
}
export const saveCertificate = (c) => certificatesStore.save(c);
export const deleteCertificate = (id) => certificatesStore.remove(id);
