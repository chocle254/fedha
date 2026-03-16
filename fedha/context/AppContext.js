import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { genId, todayISO } from '../lib/utils';
import {
  getWallets, saveWallet, deleteWallet,
  getTransactions, saveTransaction, deleteTransaction,
  getBudgets, saveBudget, deleteBudget,
  getLoans, saveLoan, deleteLoan,
  getGoals, saveGoal, deleteGoal,
  getIncomePlans, saveIncomePlan, deleteIncomePlan,
  getSetting, setSetting, seedDefaultData,
} from '../lib/db';

const AppContext = createContext({});

export function AppProvider({ children }) {
  const [wallets, setWallets] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [loans, setLoans] = useState([]);
  const [goals, setGoals] = useState([]);
  const [incomePlans, setIncomePlans] = useState([]);
  const [currency, setCurrencyState] = useState('KES');
  const [isOnline, setIsOnline] = useState(true);
  const [loading, setLoading] = useState(true);

  // Load all data
  const loadAll = useCallback(async () => {
    await seedDefaultData();
    const [ws, ts, bs, ls, gs, ips, cur] = await Promise.all([
      getWallets(),
      getTransactions(),
      getBudgets(),
      getLoans(),
      getGoals(),
      getIncomePlans(),
      getSetting('currency', 'KES'),
    ]);
    setWallets(ws);
    setTransactions(ts);
    setBudgets(bs);
    setLoans(ls);
    setGoals(gs);
    setIncomePlans(ips);
    setCurrencyState(cur);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    setIsOnline(navigator.onLine);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [loadAll]);

  // ─── WALLETS ────────────────────────────────────────────────────────────────
  const addWallet = useCallback(async (data) => {
    const w = await saveWallet({ id: genId(), created_at: todayISO(), balance: 0, ...data });
    setWallets((prev) => [...prev, w]);
    return w;
  }, []);

  const updateWallet = useCallback(async (wallet) => {
    const w = await saveWallet(wallet);
    setWallets((prev) => prev.map((x) => (x.id === w.id ? w : x)));
    return w;
  }, []);

  const removeWallet = useCallback(async (id) => {
    await deleteWallet(id);
    setWallets((prev) => prev.filter((x) => x.id !== id));
  }, []);

  // ─── TRANSACTIONS ───────────────────────────────────────────────────────────
  const addTransaction = useCallback(async (data) => {
    const tx = await saveTransaction({ id: genId(), date: todayISO(), created_at: new Date().toISOString(), ...data });
    setTransactions((prev) => [tx, ...prev]);
    // Refresh wallets and budgets after balance update
    const [ws, bs] = await Promise.all([getWallets(), getBudgets()]);
    setWallets(ws);
    setBudgets(bs);
    return tx;
  }, []);

  const removeTransaction = useCallback(async (id) => {
    await deleteTransaction(id);
    setTransactions((prev) => prev.filter((x) => x.id !== id));
    const [ws, bs] = await Promise.all([getWallets(), getBudgets()]);
    setWallets(ws);
    setBudgets(bs);
  }, []);

  // ─── BUDGETS ────────────────────────────────────────────────────────────────
  const addBudget = useCallback(async (data) => {
    const b = await saveBudget({ id: genId(), spent: 0, created_at: new Date().toISOString(), ...data });
    setBudgets((prev) => [...prev, b]);
    return b;
  }, []);

  const updateBudget = useCallback(async (budget) => {
    const b = await saveBudget(budget);
    setBudgets((prev) => prev.map((x) => (x.id === b.id ? b : x)));
    return b;
  }, []);

  const removeBudget = useCallback(async (id) => {
    await deleteBudget(id);
    setBudgets((prev) => prev.filter((x) => x.id !== id));
  }, []);

  // ─── LOANS ──────────────────────────────────────────────────────────────────
  const addLoan = useCallback(async (data) => {
    const l = await saveLoan({ id: genId(), status: 'active', created_at: new Date().toISOString(), ...data });
    setLoans((prev) => [...prev, l]);
    return l;
  }, []);

  const updateLoan = useCallback(async (loan) => {
    const l = await saveLoan(loan);
    setLoans((prev) => prev.map((x) => (x.id === l.id ? l : x)));
    return l;
  }, []);

  const removeLoan = useCallback(async (id) => {
    await deleteLoan(id);
    setLoans((prev) => prev.filter((x) => x.id !== id));
  }, []);

  // ─── GOALS ──────────────────────────────────────────────────────────────────
  const addGoal = useCallback(async (data) => {
    const g = await saveGoal({ id: genId(), current: 0, created_at: new Date().toISOString(), ...data });
    setGoals((prev) => [...prev, g]);
    return g;
  }, []);

  const updateGoal = useCallback(async (goal) => {
    const g = await saveGoal(goal);
    setGoals((prev) => prev.map((x) => (x.id === g.id ? g : x)));
    return g;
  }, []);

  const removeGoal = useCallback(async (id) => {
    await deleteGoal(id);
    setGoals((prev) => prev.filter((x) => x.id !== id));
  }, []);

  // ─── INCOME PLANS ───────────────────────────────────────────────────────────
  const addIncomePlan = useCallback(async (data) => {
    const p = await saveIncomePlan({ id: genId(), is_received: false, allocations: [], created_at: new Date().toISOString(), ...data });
    setIncomePlans((prev) => [...prev, p]);
    return p;
  }, []);

  const updateIncomePlan = useCallback(async (plan) => {
    const p = await saveIncomePlan(plan);
    setIncomePlans((prev) => prev.map((x) => (x.id === p.id ? p : x)));
    return p;
  }, []);

  const removeIncomePlan = useCallback(async (id) => {
    await deleteIncomePlan(id);
    setIncomePlans((prev) => prev.filter((x) => x.id !== id));
  }, []);

  // ─── SETTINGS ───────────────────────────────────────────────────────────────
  const setCurrency = useCallback(async (cur) => {
    await setSetting('currency', cur);
    setCurrencyState(cur);
  }, []);

  // ─── DERIVED ────────────────────────────────────────────────────────────────
  const totalBalance = wallets.reduce((s, w) => s + (Number(w.balance) || 0), 0);
  const totalLoaned = loans.filter((l) => l.type === 'lent' && l.status === 'active').reduce((s, l) => s + Number(l.remaining || l.amount), 0);
  const totalBorrowed = loans.filter((l) => l.type === 'borrowed' && l.status === 'active').reduce((s, l) => s + Number(l.remaining || l.amount), 0);
  const netWorth = totalBalance + totalLoaned - totalBorrowed;

  return (
    <AppContext.Provider value={{
      loading, isOnline, currency, setCurrency,
      wallets, addWallet, updateWallet, removeWallet,
      transactions, addTransaction, removeTransaction,
      budgets, addBudget, updateBudget, removeBudget,
      loans, addLoan, updateLoan, removeLoan,
      goals, addGoal, updateGoal, removeGoal,
      incomePlans, addIncomePlan, updateIncomePlan, removeIncomePlan,
      totalBalance, totalLoaned, totalBorrowed, netWorth,
      reload: loadAll,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
