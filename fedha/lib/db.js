
import { openDB } from 'idb';

const DB_NAME = 'fedha_db';
const DB_VERSION = 6;

let dbPromise = null;

// iOS/Safari cold-start fix: first IndexedDB access can hang/return empty.
function idbReady() {
  if (typeof indexedDB === 'undefined' || !indexedDB.databases) return Promise.resolve();
  const isSafari = typeof navigator !== 'undefined' &&
    /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Android/.test(navigator.userAgent);
  if (!isSafari) return Promise.resolve();
  let id;
  return new Promise((resolve) => {
    const check = () => indexedDB.databases().finally(resolve);
    id = setInterval(check, 100);
    check();
  }).finally(() => clearInterval(id));
}

// THE key fix for "my data keeps disappearing": ask the browser not to evict us.
async function requestPersistence() {
  try {
    if (navigator?.storage?.persist && navigator?.storage?.persisted) {
      const already = await navigator.storage.persisted();
      if (!already) {
        const granted = await navigator.storage.persist();
        console.log('[fedha] persistent storage granted:', granted);
      }
    }
  } catch (e) {
    console.warn('[fedha] persist() failed:', e?.message);
  }
}

function getDB() {
  if (typeof window === 'undefined') return null;
  if (!dbPromise) {
    dbPromise = (async () => {
      await idbReady();
      await requestPersistence();
      return openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('wallets')) db.createObjectStore('wallets', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('transactions')) {
            const ts = db.createObjectStore('transactions', { keyPath: 'id' });
            ts.createIndex('date', 'date'); ts.createIndex('wallet_id', 'wallet_id'); ts.createIndex('type', 'type');
          }
          if (!db.objectStoreNames.contains('budgets')) db.createObjectStore('budgets', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('loans')) {
            const ls = db.createObjectStore('loans', { keyPath: 'id' });
            ls.createIndex('due_date', 'due_date'); ls.createIndex('status', 'status');
          }
          if (!db.objectStoreNames.contains('goals')) db.createObjectStore('goals', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('income_plans')) db.createObjectStore('income_plans', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
          if (!db.objectStoreNames.contains('food_logs')) {
            const fs = db.createObjectStore('food_logs', { keyPath: 'id' }); fs.createIndex('date', 'date');
          }
          if (!db.objectStoreNames.contains('challenges')) db.createObjectStore('challenges', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('hackathons')) {
            const hs = db.createObjectStore('hackathons', { keyPath: 'id' });
            hs.createIndex('deadline', 'deadline');
          }
          if (!db.objectStoreNames.contains('startups')) db.createObjectStore('startups', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('beauty_logs')) {
            const bls = db.createObjectStore('beauty_logs', { keyPath: 'id' });
            bls.createIndex('date', 'date');
          }
          if (!db.objectStoreNames.contains('online_jobs')) db.createObjectStore('online_jobs', { keyPath: 'id' });
        },
      });
    })().catch((e) => {
      console.error('[fedha] IndexedDB open failed:', e);
      dbPromise = null; // allow retry next call instead of silently breaking
      throw e;
    });
  }
  return dbPromise;
}

// safe read wrapper — logs instead of silently returning empty
async function safeGetAll(store) {
  try { const db = await getDB(); return await db.getAll(store); }
  catch (e) { console.error(`[fedha] read ${store} failed:`, e?.message); return []; }
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────
export async function getSetting(key, fallback = null) {
  try { const db = await getDB(); const row = await db.get('settings', key); return row ? row.value : fallback; }
  catch (e) { console.error('[fedha] getSetting failed:', key, e?.message); return fallback; }
}
export async function setSetting(key, value) { const db = await getDB(); return db.put('settings', { key, value }); }

// ─── WALLETS ─────────────────────────────────────────────────────────────────
export async function getWallets() { return safeGetAll('wallets'); }
export async function saveWallet(wallet) {
  const db = await getDB();
  const record = { synced: false, ...wallet, updated_at: new Date().toISOString() };
  await db.put('wallets', record); return record;
}
export async function deleteWallet(id) { const db = await getDB(); return db.delete('wallets', id); }

// ─── TRANSACTIONS ─────────────────────────────────────────────────────────────
export async function getTransactions(filters = {}) {
  let all = await safeGetAll('transactions');
  if (filters.wallet_id) all = all.filter((t) => t.wallet_id === filters.wallet_id);
  if (filters.type) all = all.filter((t) => t.type === filters.type);
  if (filters.category) all = all.filter((t) => t.category === filters.category);
  if (filters.from_date) all = all.filter((t) => t.date >= filters.from_date);
  if (filters.to_date) all = all.filter((t) => t.date <= filters.to_date);
  return all.sort((a, b) => new Date(b.date) - new Date(a.date));
}
export async function saveTransaction(tx) {
  const db = await getDB();
  const now = new Date().toISOString();
  const record = { synced: false, ...tx, updated_at: now };
  await db.put('transactions', record);
  const wallet = await db.get('wallets', tx.wallet_id);
  if (wallet) {
    wallet.balance = (Number(wallet.balance) || 0) + (tx.type === 'income' ? Number(tx.amount) : -Number(tx.amount));
    await db.put('wallets', { ...wallet, updated_at: now });
  }
  if (tx.type === 'transfer' && tx.to_wallet_id) {
    const toW = await db.get('wallets', tx.to_wallet_id);
    if (toW) { toW.balance = (Number(toW.balance) || 0) + Number(tx.amount); await db.put('wallets', { ...toW, updated_at: now }); }
  }
  if (tx.type === 'expense' && tx.category) {
    const budgets = await db.getAll('budgets');
    const b = budgets.find((x) => x.category === tx.category);
    if (b) { b.spent = (Number(b.spent) || 0) + Number(tx.amount); await db.put('budgets', { ...b, updated_at: now }); }
  }
  return record;
}
export async function deleteTransaction(id) {
  const db = await getDB();
  const tx = await db.get('transactions', id);
  if (!tx) return;
  const now = new Date().toISOString();
  const wallet = await db.get('wallets', tx.wallet_id);
  if (wallet) {
    wallet.balance = (Number(wallet.balance) || 0) + (tx.type === 'income' ? -Number(tx.amount) : Number(tx.amount));
    await db.put('wallets', { ...wallet, updated_at: now });
  }
  if (tx.type === 'transfer' && tx.to_wallet_id) {
    const toW = await db.get('wallets', tx.to_wallet_id);
    if (toW) { toW.balance = (Number(toW.balance) || 0) - Number(tx.amount); await db.put('wallets', { ...toW, updated_at: now }); }
  }
  if (tx.type === 'expense' && tx.category) {
    const budgets = await db.getAll('budgets');
    const b = budgets.find((x) => x.category === tx.category);
    if (b) { b.spent = Math.max(0, (Number(b.spent) || 0) - Number(tx.amount)); await db.put('budgets', { ...b, updated_at: now }); }
  }
  return db.delete('transactions', id);
}

// ─── BUDGETS / LOANS / GOALS / INCOME PLANS ────────────────────────────────────
export async function getBudgets() { return safeGetAll('budgets'); }
export async function saveBudget(b) { const db = await getDB(); const r = { synced: false, ...b, updated_at: new Date().toISOString() }; await db.put('budgets', r); return r; }
export async function deleteBudget(id) { const db = await getDB(); return db.delete('budgets', id); }

export async function getLoans() { return safeGetAll('loans'); }
export async function saveLoan(l) { const db = await getDB(); const r = { synced: false, ...l, updated_at: new Date().toISOString() }; await db.put('loans', r); return r; }
export async function deleteLoan(id) { const db = await getDB(); return db.delete('loans', id); }

export async function getGoals() { return safeGetAll('goals'); }
export async function saveGoal(g) { const db = await getDB(); const r = { synced: false, ...g, updated_at: new Date().toISOString() }; await db.put('goals', r); return r; }
export async function deleteGoal(id) { const db = await getDB(); return db.delete('goals', id); }

export async function getIncomePlans() { return safeGetAll('income_plans'); }
export async function saveIncomePlan(p) { const db = await getDB(); const r = { synced: false, ...p, updated_at: new Date().toISOString() }; await db.put('income_plans', r); return r; }
export async function deleteIncomePlan(id) { const db = await getDB(); return db.delete('income_plans', id); }

// ─── FOOD LOGS ───────────────────────────────────────────────────────────────
export async function getFoodLogs(date) {
  try {
    const db = await getDB();
    if (date) { const all = await db.getAllFromIndex('food_logs', 'date', date); return all.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); }
    return db.getAll('food_logs');
  } catch (e) { console.error('[fedha] read food_logs failed:', e?.message); return []; }
}
export async function saveFoodLog(entry) { const db = await getDB(); const r = { synced: false, ...entry, updated_at: new Date().toISOString() }; await db.put('food_logs', r); return r; }
export async function deleteFoodLog(id) { const db = await getDB(); return db.delete('food_logs', id); }

// ─── CHALLENGES ──────────────────────────────────────────────────────────────
export async function getChallenges() { return safeGetAll('challenges'); }
export async function saveChallenge(c) { const db = await getDB(); const r = { synced: false, ...c, updated_at: new Date().toISOString() }; await db.put('challenges', r); return r; }
export async function deleteChallenge(id) { const db = await getDB(); return db.delete('challenges', id); }

// ─── HACKATHONS ──────────────────────────────────────────────────────────────
export async function getHackathons() { return safeGetAll('hackathons'); }
export async function saveHackathon(h) { const db = await getDB(); const r = { synced: false, ...h, updated_at: new Date().toISOString() }; await db.put('hackathons', r); return r; }
export async function deleteHackathon(id) { const db = await getDB(); return db.delete('hackathons', id); }

// ─── STARTUPS ────────────────────────────────────────────────────────────────
export async function getStartups() { return safeGetAll('startups'); }
export async function saveStartup(s) { const db = await getDB(); const r = { synced: false, ...s, updated_at: new Date().toISOString() }; await db.put('startups', r); return r; }
export async function deleteStartup(id) { const db = await getDB(); return db.delete('startups', id); }

// ─── ONLINE JOBS ─────────────────────────────────────────────────────────────
export async function getOnlineJobs() {
  try {
    const db = await getDB();
    const all = await db.getAll('online_jobs');
    return all.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  } catch (e) { console.error('[fedha] read online_jobs failed:', e?.message); return []; }
}
export async function saveOnlineJob(job) { const db = await getDB(); const r = { synced: false, ...job, updated_at: new Date().toISOString() }; await db.put('online_jobs', r); return r; }
export async function deleteOnlineJob(id) { const db = await getDB(); return db.delete('online_jobs', id); }

// ─── SEED DEFAULT DATA ──────────────────────────────────────────────────────────
export async function seedDefaultData() {
  const db = await getDB();
  const existing = await db.getAll('wallets');
  if (existing.length > 0) return;
  const now = new Date().toISOString();
  const defaults = [
    { id: 'mpesa', name: 'M-Pesa', type: 'mobile', balance: 0, currency: 'KES', color: '#10B981', icon: '📱', created_at: now, updated_at: now, synced: false },
    { id: 'bank', name: 'Bank Account', type: 'bank', balance: 0, currency: 'KES', color: '#3B82F6', icon: '🏦', created_at: now, updated_at: now, synced: false },
    { id: 'cash', name: 'Cash', type: 'cash', balance: 0, currency: 'KES', color: '#F59E0B', icon: '💵', created_at: now, updated_at: now, synced: false },
    { id: 'airtel', name: 'Airtel Money', type: 'mobile', balance: 0, currency: 'KES', color: '#EF4444', icon: '📲', created_at: now, updated_at: now, synced: false },
  ];
  for (const w of defaults) await db.put('wallets', w);
}
