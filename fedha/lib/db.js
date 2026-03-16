import { openDB } from 'idb';

const DB_NAME = 'fedha_db';
const DB_VERSION = 1;

let dbPromise = null;

function getDB() {
  if (typeof window === 'undefined') return null;
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('wallets')) {
          db.createObjectStore('wallets', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('transactions')) {
          const ts = db.createObjectStore('transactions', { keyPath: 'id' });
          ts.createIndex('date', 'date');
          ts.createIndex('wallet_id', 'wallet_id');
          ts.createIndex('type', 'type');
        }
        if (!db.objectStoreNames.contains('budgets')) {
          db.createObjectStore('budgets', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('loans')) {
          const ls = db.createObjectStore('loans', { keyPath: 'id' });
          ls.createIndex('due_date', 'due_date');
          ls.createIndex('status', 'status');
        }
        if (!db.objectStoreNames.contains('goals')) {
          db.createObjectStore('goals', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('income_plans')) {
          db.createObjectStore('income_plans', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────
export async function getSetting(key, fallback = null) {
  const db = await getDB();
  const row = await db.get('settings', key);
  return row ? row.value : fallback;
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

  // Update source wallet balance
  const wallet = await db.get('wallets', tx.wallet_id);
  if (wallet) {
    if (tx.type === 'income') wallet.balance = (wallet.balance || 0) + Number(tx.amount);
    else wallet.balance = (wallet.balance || 0) - Number(tx.amount);
    await db.put('wallets', { ...wallet, updated_at: now });
  }

  // Transfer: credit destination wallet
  if (tx.type === 'transfer' && tx.to_wallet_id) {
    const toWallet = await db.get('wallets', tx.to_wallet_id);
    if (toWallet) {
      toWallet.balance = (toWallet.balance || 0) + Number(tx.amount);
      await db.put('wallets', { ...toWallet, updated_at: now });
    }
  }

  // Update budget envelope spent amount
  if (tx.type === 'expense' && tx.category) {
    const budgets = await db.getAll('budgets');
    const budget = budgets.find((b) => b.category === tx.category);
    if (budget) {
      budget.spent = (budget.spent || 0) + Number(tx.amount);
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

  // Reverse wallet balance
  const wallet = await db.get('wallets', tx.wallet_id);
  if (wallet) {
    if (tx.type === 'income') wallet.balance -= Number(tx.amount);
    else wallet.balance += Number(tx.amount);
    await db.put('wallets', { ...wallet, updated_at: now });
  }
  if (tx.type === 'transfer' && tx.to_wallet_id) {
    const toWallet = await db.get('wallets', tx.to_wallet_id);
    if (toWallet) {
      toWallet.balance -= Number(tx.amount);
      await db.put('wallets', { ...toWallet, updated_at: now });
    }
  }

  // Reverse budget spend
  if (tx.type === 'expense' && tx.category) {
    const budgets = await db.getAll('budgets');
    const budget = budgets.find((b) => b.category === tx.category);
    if (budget) {
      budget.spent = Math.max(0, (budget.spent || 0) - Number(tx.amount));
      await db.put('budgets', { ...budget, updated_at: now });
    }
  }

  return db.delete('transactions', id);
}

// ─── BUDGETS ─────────────────────────────────────────────────────────────────
export async function getBudgets() {
  const db = await getDB();
  return db.getAll('budgets');
}
export async function saveBudget(budget) {
  const db = await getDB();
  const record = { synced: false, ...budget, updated_at: new Date().toISOString() };
  await db.put('budgets', record);
  return record;
}
export async function deleteBudget(id) {
  const db = await getDB();
  return db.delete('budgets', id);
}

// ─── LOANS ───────────────────────────────────────────────────────────────────
export async function getLoans() {
  const db = await getDB();
  return db.getAll('loans');
}
export async function saveLoan(loan) {
  const db = await getDB();
  const record = { synced: false, ...loan, updated_at: new Date().toISOString() };
  await db.put('loans', record);
  return record;
}
export async function deleteLoan(id) {
  const db = await getDB();
  return db.delete('loans', id);
}

// ─── GOALS ───────────────────────────────────────────────────────────────────
export async function getGoals() {
  const db = await getDB();
  return db.getAll('goals');
}
export async function saveGoal(goal) {
  const db = await getDB();
  const record = { synced: false, ...goal, updated_at: new Date().toISOString() };
  await db.put('goals', record);
  return record;
}
export async function deleteGoal(id) {
  const db = await getDB();
  return db.delete('goals', id);
}

// ─── INCOME PLANS ─────────────────────────────────────────────────────────────
export async function getIncomePlans() {
  const db = await getDB();
  return db.getAll('income_plans');
}
export async function saveIncomePlan(plan) {
  const db = await getDB();
  const record = { synced: false, ...plan, updated_at: new Date().toISOString() };
  await db.put('income_plans', record);
  return record;
}
export async function deleteIncomePlan(id) {
  const db = await getDB();
  return db.delete('income_plans', id);
}

// ─── SEED DEFAULT DATA ────────────────────────────────────────────────────────
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
