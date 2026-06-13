import { openDB } from 'idb';

const DB_NAME = 'fedha_db';
const DB_VERSION = 2; // bumped: added "challenges" store

let dbPromise = null;

// ── Safari/iOS IndexedDB cold-start fix ──────────────────────────────────────
// WebKit has a bug where the first IndexedDB access after launch hangs/returns
// empty. This waits until IndexedDB is actually ready before we open it.
function idbReady() {
  if (typeof indexedDB === 'undefined' || !indexedDB.databases) return Promise.resolve();
  const isSafari =
    typeof navigator !== 'undefined' &&
    /Safari/.test(navigator.userAgent) &&
    !/Chrome|Chromium|Android/.test(navigator.userAgent);
  if (!isSafari) return Promise.resolve();
  let intervalId;
  return new Promise((resolve) => {
    const check = () => indexedDB.databases().finally(resolve);
    intervalId = setInterval(check, 100);
    check();
  }).finally(() => clearInterval(intervalId));
}

async function requestPersistence() {
  try {
    if (navigator?.storage?.persist && navigator?.storage?.persisted) {
      const already = await navigator.storage.persisted();
      if (!already) await navigator.storage.persist();
    }
  } catch (e) {
    console.warn('[fedha] persistent storage request failed:', e?.message);
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
            ts.createIndex('date', 'date');
            ts.createIndex('wallet_id', 'wallet_id');
            ts.createIndex('type', 'type');
          }
          if (!db.objectStoreNames.contains('budgets')) db.createObjectStore('budgets', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('loans')) {
            const ls = db.createObjectStore('loans', { keyPath: 'id' });
            ls.createIndex('due_date', 'due_date');
            ls.createIndex('status', 'status');
          }
          if (!db.objectStoreNames.contains('goals')) db.createObjectStore('goals', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('income_plans')) db.createObjectStore('income_plans', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
          if (!db.objectStoreNames.contains('challenges')) db.createObjectStore('challenges', { keyPath: 'id' });
        },
      });
    })().catch((e) => {
      console.error('[fedha] Failed to open IndexedDB:', e);
      dbPromise = null; // allow a retry on next call
      throw e;
    });
  }
  return dbPromise;
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────
export async function getSetting(key, fallback = null) {
  try {
    const db = await getDB();
    const row = await db.get('settings', key);
    return row ? row.value : fallback;
  } catch (e) {
    console.error('[fedha] getSetting failed:', key, e?.message);
    return fallback;
  }
}
export async function setSetting(key, value) {
  const db = await getDB();
  return db.put('settings', { key, value });
}

// ─── WALLETS ─────────────────────────────────────────────────────────────────
export async function getWallets() {
  const db = await getDB();
  return db.getAll('wallets');
}
export async function saveWallet(wallet) {
  const db = await getDB();
  const now = new Date().toISOString();
  const record = { synced: false, ...wallet, updated_at: now };
  await db.put('wallets', record);
  return record;
}
export async function deleteWallet(id) {
  const db = await getDB();
  return db.delete('wallets', id);
}

// ─── TRANSACTIONS ─────────────────────────────────────────────────────────────
export async function getTransactions(filters = {}) {
  const db = await getDB();
  let all = await db.getAll('transactions');
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
    if (tx.type === 'income') wallet.balance = (Number(wallet.balance) || 0) + Number(tx.amount);
    else wallet.balance = (Number(wallet.balance) || 0) - Number(tx.amount);
    await db.put('wallets', { ...wallet, updated_at: now });
  }

  if (tx.type === 'transfer' && tx.to_wallet_id) {
    const toWallet = await db.get('wallets', tx.to_wallet_id);
    if (toWallet) {
      toWallet.balance = (Number(toWallet.balance) || 0) + Number(tx.amount);
      await db.put('wallets', { ...toWallet, updated_at: now });
    }
  }

  if (tx.type === 'expense' && tx.category) {
    const budgets = await db.getAll('budgets');
    const budget = budgets.find((b) => b.category === tx.category);
    if (budget) {
      budget.spent = (Number(budget.spent) || 0) + Number(tx.amount);
      await db.put('budgets', { ...budget, updated_at: now });
    }
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
    if (tx.type === 'income') wallet.balance = (Number(wallet.balance) || 0) - Number(tx.amount);
    else wallet.balance = (Number(wallet.balance) || 0) + Number(tx.amount);
    await db.put('wallets', { ...wallet, updated_at: now });
  }
  if (tx.type === 'transfer' && tx.to_wallet_id) {
    const toWallet = await db.get('wallets', tx.to_wallet_id);
    if (toWallet) {
      toWallet.balance = (Number(toWallet.balance) || 0) - Number(tx.amount);
      await db.put('wallets', { ...toWallet, updated_at: now });
    }
  }
  if (tx.type === 'expense' && tx.category) {
    const budgets = await db.getAll('budgets');
    const budget = budgets.find((b) => b.category === tx.category);
    if (budget) {
      budget.spent = Math.max(0, (Number(budget.spent) || 0) - Number(tx.amount));
      await db.put('budgets', { ...budget, updated_at: now });
    }
  }
  return db.delete('transactions', id);
}

// Recompute every wallet balance from the transaction ledger (fixes drift).
export async function reconcileWalletBalances() {
  const db = await getDB();
  const [wallets, txns] = await Promise.all([db.getAll('wallets'), db.getAll('transactions')]);
  const totals = {};
  wallets.forEach((w) => { totals[w.id] = Number(w.opening_balance) || 0; });
  txns.forEach((t) => {
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') totals[t.wallet_id] = (totals[t.wallet_id] || 0) + amt;
    else if (t.type === 'expense') totals[t.wallet_id] = (totals[t.wallet_id] || 0) - amt;
    else if (t.type === 'transfer') {
      totals[t.wallet_id] = (totals[t.wallet_id] || 0) - amt;
      if (t.to_wallet_id) totals[t.to_wallet_id] = (totals[t.to_wallet_id] || 0) + amt;
    }
  });
  const now = new Date().toISOString();
  for (const w of wallets) {
    const next = totals[w.id] || 0;
    if (next !== Number(w.balance)) await db.put('wallets', { ...w, balance: next, updated_at: now });
  }
  return db.getAll('wallets');
}

// ─── BUDGETS ─────────────────────────────────────────────────────────────────
export async function getBudgets() { const db = await getDB(); return db.getAll('budgets'); }
export async function saveBudget(budget) {
  const db = await getDB();
  const record = { synced: false, ...budget, updated_at: new Date().toISOString() };
  await db.put('budgets', record); return record;
}
export async function deleteBudget(id) { const db = await getDB(); return db.delete('budgets', id); }

// ─── LOANS ───────────────────────────────────────────────────────────────────
export async function getLoans() { const db = await getDB(); return db.getAll('loans'); }
export async function saveLoan(loan) {
  const db = await getDB();
  const record = { synced: false, ...loan, updated_at: new Date().toISOString() };
  await db.put('loans', record); return record;
}
export async function deleteLoan(id) { const db = await getDB(); return db.delete('loans', id); }

// ─── GOALS ───────────────────────────────────────────────────────────────────
export async function getGoals() { const db = await getDB(); return db.getAll('goals'); }
export async function saveGoal(goal) {
  const db = await getDB();
  const record = { synced: false, ...goal, updated_at: new Date().toISOString() };
  await db.put('goals', record); return record;
}
export async function deleteGoal(id) { const db = await getDB(); return db.delete('goals', id); }

// ─── INCOME PLANS ─────────────────────────────────────────────────────────────
export async function getIncomePlans() { const db = await getDB(); return db.getAll('income_plans'); }
export async function saveIncomePlan(plan) {
  const db = await getDB();
  const record = { synced: false, ...plan, updated_at: new Date().toI

<AssistantMessageContentPart partEncoded="eyJjcmVhdGVkQXQiOjE3ODEzNjA1Nzg5NzgsImZpbmlzaGVkQXQiOjE3ODEzNjA1Nzg5NzgsImxhc3RQYXJ0U2VudEF0IjoxNzgxMzYwNTc4OTc4LCJpZCI6IjRZWFZkZUxLSUh0aEJpYmsiLCJ0eXBlIjoidGFzay1zdG9wcGVkLXYxIiwicGFydHMiOlt7InR5cGUiOiJtYW51YWxseS1zdG9wcGVkLW9uLWNsaWVudCJ9XX0=" />
