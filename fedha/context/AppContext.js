
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { genId, todayISO, setRates } from '../lib/utils';
import { fetchRates } from '../lib/exchange';
import {
  getWallets, saveWallet, deleteWallet,
  getTransactions, saveTransaction, deleteTransaction,
  getBudgets, saveBudget, deleteBudget,
  getLoans, saveLoan, deleteLoan,
  getGoals, saveGoal, deleteGoal,
  getIncomePlans, saveIncomePlan, deleteIncomePlan,
  getChallenges, saveChallenge, deleteChallenge,
  getHackathons, saveHackathon, deleteHackathon,
  getStartups, saveStartup, deleteStartup,
  getSetting, setSetting, seedDefaultData,
} from '../lib/db';

const AppContext = createContext({});
const BASE_CURRENCY = 'KES'; // all stored amounts are in KES

export function AppProvider({ children }) {
  const [wallets, setWallets] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [loans, setLoans] = useState([]);
  const [goals, setGoals] = useState([]);
  const [incomePlans, setIncomePlans] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [hackathons, setHackathons] = useState([]);
  const [startups, setStartups] = useState([]);
  const [currency, setCurrencyState] = useState('KES');
  const [isOnline, setIsOnline] = useState(true);
  const [loading, setLoading] = useState(true);
  const [fxVersion, setFxVersion] = useState(0); // bump to re-render converted amounts

  const loadAll = useCallback(async () => {
    await seedDefaultData();
    const [ws, ts, bs, ls, gs, ips, chs, hks, sts, cur, cachedRates] = await Promise.all([
      getWallets(), getTransactions(), getBudgets(), getLoans(),
      getGoals(), getIncomePlans(), getChallenges(),
      getHackathons(), getStartups(),
      getSetting('currency', 'KES'), getSetting('fx_rates', null),
    ]);
    setWallets(ws); setTransactions(ts); setBudgets(bs); setLoans(ls);
    setGoals(gs); setIncomePlans(ips); setChallenges(chs);
    setHackathons(hks); setStartups(sts); setCurrencyState(cur);

    // Use cached rates immediately (offline-first), then refresh from network.
    if (cachedRates) { setRates(cachedRates, BASE_CURRENCY); setFxVersion((v) => v + 1); }
    setLoading(false);

    const fresh = await fetchRates(BASE_CURRENCY);
    if (fresh) { setRates(fresh, BASE_CURRENCY); await setSetting('fx_rates', fresh); setFxVersion((v) => v + 1); }
  }, []);

  useEffect(() => {
    loadAll();
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    setIsOnline(navigator.onLine);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, [loadAll]);

  // ─── WALLETS ───────────────────────────────────────────────────────────────
  const addWallet = useCallback(async (data) => {
    const w = await saveWallet({ id: genId(), created_at: todayISO(), balance: 0, ...data });
    setWallets((prev) => [...prev, w]); return w;
  }, []);
  const updateWallet = useCallback(async (wallet) => {
    const w = await saveWallet(wallet); setWallets((prev) => prev.map((x) => (x.id === w.id ? w : x))); return w;
  }, []);
  const removeWallet = useCallback(async (id) => { await deleteWallet(id); setWallets((prev) => prev.filter((x) => x.id !== id)); }, []);

  // ─── TRANSACTIONS ──────────────────────────────────────────────────────────
  const addTransaction = useCallback(async (data) => {
    const tx = await saveTransaction({ id: genId(), date: todayISO(), created_at: new Date().toISOString(), ...data });
    setTransactions((prev) => [tx, ...prev]);
    const [ws, bs] = await Promise.all([getWallets(), getBudgets()]); setWallets(ws); setBudgets(bs); return tx;
  }, []);
  const removeTransaction = useCallback(async (id) => {
    await deleteTransaction(id); setTransactions((prev) => prev.filter((x) => x.id !== id));
    const [ws, bs] = await Promise.all([getWallets(), getBudgets()]); setWallets(ws); setBudgets(bs);
  }, []);

  // ─── BUDGETS ───────────────────────────────────────────────────────────────
  const addBudget = useCallback(async (data) => { const b = await saveBudget({ id: genId(), spent: 0, created_at: new Date().toISOString(), ...data }); setBudgets((p) => [...p, b]); return b; }, []);
  const updateBudget = useCallback(async (budget) => { const b = await saveBudget(budget); setBudgets((p) => p.map((x) => (x.id === b.id ? b : x))); return b; }, []);
  const removeBudget = useCallback(async (id) => { await deleteBudget(id); setBudgets((p) => p.filter((x) => x.id !== id)); }, []);

  // ─── LOANS ─────────────────────────────────────────────────────────────────
  const addLoan = useCallback(async (data) => { const l = await saveLoan({ id: genId(), status: 'active', created_at: new Date().toISOString(), ...data }); setLoans((p) => [...p, l]); return l; }, []);
  const updateLoan = useCallback(async (loan) => { const l = await saveLoan(loan); setLoans((p) => p.map((x) => (x.id === l.id ? l : x))); return l; }, []);
  const removeLoan = useCallback(async (id) => { await deleteLoan(id); setLoans((p) => p.filter((x) => x.id !== id)); }, []);

  // ─── GOALS ─────────────────────────────────────────────────────────────────
  const addGoal = useCallback(async (data) => { const g = await saveGoal({ id: genId(), current: 0, created_at: new Date().toISOString(), ...data }); setGoals((p) => [...p, g]); return g; }, []);
  const updateGoal = useCallback(async (goal) => { const g = await saveGoal(goal); setGoals((p) => p.map((x) => (x.id === g.id ? g : x))); return g; }, []);
  const removeGoal = useCallback(async (id) => { await deleteGoal(id); setGoals((p) => p.filter((x) => x.id !== id)); }, []);

  // ─── INCOME PLANS ──────────────────────────────────────────────────────────
  const addIncomePlan = useCallback(async (data) => { const p = await saveIncomePlan({ id: genId(), is_received: false, allocations: [], created_at: new Date().toISOString(), ...data }); setIncomePlans((x) => [...x, p]); return p; }, []);
  const updateIncomePlan = useCallback(async (plan) => { const p = await saveIncomePlan(plan); setIncomePlans((x) => x.map((y) => (y.id === p.id ? p : y))); return p; }, []);
  const removeIncomePlan = useCallback(async (id) => { await deleteIncomePlan(id); setIncomePlans((x) => x.filter((y) => y.id !== id)); }, []);

  // ─── CHALLENGES ────────────────────────────────────────────────────────────
  const addChallenge = useCallback(async (data) => { const c = await saveChallenge({ id: genId(), completed: [], start_date: todayISO(), created_at: new Date().toISOString(), ...data }); setChallenges((p) => [...p, c]); return c; }, []);
  const updateChallenge = useCallback(async (challenge) => { const c = await saveChallenge(challenge); setChallenges((p) => p.map((x) => (x.id === c.id ? c : x))); return c; }, []);
  const removeChallenge = useCallback(async (id) => { await deleteChallenge(id); setChallenges((p) => p.filter((x) => x.id !== id)); }, []);

  // ─── HACKATHONS ────────────────────────────────────────────────────────────
  const addHackathon = useCallback(async (data) => { const h = await saveHackathon({ id: genId(), tasks: [], created_at: new Date().toISOString(), ...data }); setHackathons((p) => [...p, h]); return h; }, []);
  const updateHackathon = useCallback(async (hack) => { const h = await saveHackathon(hack); setHackathons((p) => p.map((x) => (x.id === h.id ? h : x))); return h; }, []);
  const removeHackathon = useCallback(async (id) => { await deleteHackathon(id); setHackathons((p) => p.filter((x) => x.id !== id)); }, []);

  // ─── STARTUPS ──────────────────────────────────────────────────────────────
  const addStartup = useCallback(async (data) => { const s = await saveStartup({ id: genId(), stages: {}, created_at: new Date().toISOString(), ...data }); setStartups((p) => [...p, s]); return s; }, []);
  const updateStartup = useCallback(async (startup) => { const s = await saveStartup(startup); setStartups((p) => p.map((x) => (x.id === s.id ? s : x))); return s; }, []);
  const removeStartup = useCallback(async (id) => { await deleteStartup(id); setStartups((p) => p.filter((x) => x.id !== id)); }, []);

  // ─── SETTINGS ──────────────────────────────────────────────────────────────
  const setCurrency = useCallback(async (cur) => { await setSetting('currency', cur); setCurrencyState(cur); }, []);

  // ─── DERIVED ───────────────────────────────────────────────────────────────
  const totalBalance = wallets.reduce((s, w) => s + (Number(w.balance) || 0), 0);
  const totalLoaned = loans.filter((l) => l.type === 'lent' && l.status === 'active').reduce((s, l) => s + Number(l.remaining || l.amount), 0);
  const totalBorrowed = loans.filter((l) => l.type === 'borrowed' && l.status === 'active').reduce((s, l) => s + Number(l.remaining || l.amount), 0);
  const totalGoalSaved = goals.reduce((s, g) => s + (g.current || 0), 0);
  const netWorth = totalBalance + totalLoaned + totalGoalSaved - totalBorrowed;

  return (
    <AppContext.Provider value={{
      loading, isOnline, currency, setCurrency, fxVersion,
      wallets, addWallet, updateWallet, removeWallet,
      transactions, addTransaction, removeTransaction,
      budgets, addBudget, updateBudget, removeBudget,
      loans, addLoan, updateLoan, removeLoan,
      goals, addGoal, updateGoal, removeGoal,
      incomePlans, addIncomePlan, updateIncomePlan, removeIncomePlan,
      challenges, addChallenge, updateChallenge, removeChallenge,
      hackathons, addHackathon, updateHackathon, removeHackathon,
      startups, addStartup, updateStartup, removeStartup,
      totalBalance, totalLoaned, totalBorrowed, totalGoalSaved, netWorth,
      reload: loadAll,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
