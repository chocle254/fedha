import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { releaseDueUnlocks } from '../lib/ziidi';
import { genId, todayISO, setRates, goalsInTurnOrder, fillGoalsInOrder } from '../lib/utils';
import { fetchRates } from '../lib/exchange';
import { loanIdFromPaymentTx } from '../lib/finance-actions';
import { startSyncEngine, onSyncStatusChange, getPendingCount } from '../lib/sync-engine';
import {
  getWallets, saveWallet, deleteWallet,
  getTransactions, saveTransaction, deleteTransaction, getTransaction,
  getBudgets, saveBudget, deleteBudget,
  getLoans, saveLoan, deleteLoan,
  getGoals, saveGoal, deleteGoal,
  getIncomePlans, saveIncomePlan, deleteIncomePlan,
  getChallenges, saveChallenge, deleteChallenge,
  getHackathons, saveHackathon, deleteHackathon,
  getStartups, saveStartup, deleteStartup,
  getOnlineJobs, saveOnlineJob, deleteOnlineJob,
  getProjects, saveProject, deleteProject,
  getCertificates, saveCertificate, deleteCertificate,
  getResearch, saveResearch, deleteResearch,
  getClientProjects, saveClientProject, deleteClientProject,
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
  const [onlineJobs, setOnlineJobs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [research, setResearch] = useState([]);
  const [clientProjects, setClientProjects] = useState([]);
  const [courses, setCourses] = useState([]);
  const [currency, setCurrencyState] = useState('KES');
  const [isOnline, setIsOnline] = useState(true);
  const [loading, setLoading] = useState(true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [fxVersion, setFxVersion] = useState(0); // bump to re-render converted amounts
  const [savingsPlanDays, setSavingsPlanDaysState] = useState(null); // chosen timeframe for the goals savings plan
  const [savingsQueue, setSavingsQueue] = useState([]); // deposits waiting on a "save 30%?" answer, asked one at a time
  const pendingSavings = savingsQueue[0] || null;
  const [lastSavedGoalId, setLastSavedGoalIdState] = useState(null); // goal that got the last deposit cut; the next one is up next

  const loadAll = useCallback(async () => {
    await seedDefaultData();
    const [ws, ts, bs, ls, gs, ips, chs, hks, sts, ojs, prs, crts, rsc, cps, crs, cur, cachedRates, spd, lsg] = await Promise.all([
      getWallets(), getTransactions(), getBudgets(), getLoans(),
      getGoals(), getIncomePlans(), getChallenges(),
      getHackathons(), getStartups(), getOnlineJobs(), getProjects(), getCertificates(), getResearch(), getClientProjects(),
      getSetting('courses', []), getSetting('currency', 'KES'), getSetting('fx_rates', null),
      getSetting('savings_plan_days', null), getSetting('last_saved_goal_id', null),
    ]);
    setWallets(ws); setTransactions(ts); setBudgets(bs); setLoans(ls);
    setGoals(gs); setIncomePlans(ips); setChallenges(chs);
    setHackathons(hks); setStartups(sts); setOnlineJobs(ojs); setProjects(prs); setCertificates(crts); setResearch(rsc); setClientProjects(cps || []); setCourses(Array.isArray(crs) ? crs : []); setCurrencyState(cur);
    setSavingsPlanDaysState(spd);
    setLastSavedGoalIdState(lsg);

    // Use cached rates immediately (offline-first), then refresh from network.
    if (cachedRates) { setRates(cachedRates, BASE_CURRENCY); setFxVersion((v) => v + 1); }
    setLoading(false);

    const fresh = await fetchRates(BASE_CURRENCY);
    if (fresh) { setRates(fresh, BASE_CURRENCY); await setSetting('fx_rates', fresh); setFxVersion((v) => v + 1); }
  }, []);

  useEffect(() => {
    loadAll();
    startSyncEngine();

    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    setIsOnline(navigator.onLine);

    // The background refresh inside lib/db.js's getX() functions updates
    // the local cache silently; this event tells us when that happened so
    // we can re-run loadAll() to pick up server-side changes (e.g. another
    // device's edits) without the user having to reload the page.
    let refreshTimer = null;
    const onDbChanged = () => {
      // Debounce: a single write can touch several tables (transactions +
      // wallets + budgets) in quick succession, each firing its own event —
      // collapse those into one loadAll() instead of three.
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(loadAll, 300);
    };
    window.addEventListener('fedha:db-changed', onDbChanged);

    const unsubSync = onSyncStatusChange(async () => setPendingSyncCount(await getPendingCount()));
    getPendingCount().then(setPendingSyncCount);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('fedha:db-changed', onDbChanged);
      clearTimeout(refreshTimer);
      unsubSync();
    };
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
  // After every deposit the user is asked to save 30% of it (SavingsPrompt).
  // Goals take turns: one goal per deposit, spilling to the next goal if the
  // current one needs less. The cut is its own "savings" expense with id
  // <deposit id>_save, so deleting the deposit can find it and undo it.
  const saveCutFromDeposit = useCallback(async (deposit, amount) => {
    const [allGoals, lastId] = await Promise.all([getGoals(), getSetting('last_saved_goal_id', null)]);
    const queue = goalsInTurnOrder(allGoals, lastId);
    if (!queue.length) return null;
    const cut = Math.round(Math.min(Number(amount), Number(deposit.amount)) * 100) / 100;
    const fills = fillGoalsInOrder(queue, cut).filter((a) => a.allocated > 0);
    const total = Math.round(fills.reduce((s, a) => s + a.allocated, 0) * 100) / 100;
    if (total <= 0) return null;

    // If this wallet has Ziidi, the savings go into Ziidi Locked (a transfer, so the money is still yours,
    // just locked). Otherwise it is recorded as a savings expense like before.
    const lockedPocket = (await getWallets()).find((w) => w.parent_id === deposit.wallet_id && w.pocket === 'ziidi_locked');
    const saveTx = await saveTransaction({
      id: `${deposit.id}_save`,
      type: lockedPocket ? 'transfer' : 'expense',
      ...(lockedPocket ? { to_wallet_id: lockedPocket.id } : {}),
      amount: total,
      wallet_id: deposit.wallet_id,
      category: 'savings',
      description: `Saved for ${fills.map((a) => a.name).join(', ')}`,
      date: deposit.date || todayISO(),
      currency: deposit.currency,
      created_at: new Date().toISOString(),
      savings_allocations: fills.map((a) => ({ goal_id: a.id, amount: a.allocated })),
    });
    for (const a of fills) {
      const g = allGoals.find((x) => x.id === a.id);
      if (g) await saveGoal({ ...g, current: (Number(g.current) || 0) + a.allocated });
    }
    // Pass the turn on so the next deposit goes to the next goal.
    await setSetting('last_saved_goal_id', queue[0].id);
    setLastSavedGoalIdState(queue[0].id);
    setGoals(await getGoals());
    return saveTx;
  }, []);

  // Undo a savings cut: take each goal's share back off it.
  const undoSavingsCut = useCallback(async (tx) => {
    if (!tx?.savings_allocations?.length) return;
    const allGoals = await getGoals();
    for (const a of tx.savings_allocations) {
      const g = allGoals.find((x) => x.id === a.goal_id);
      if (g) await saveGoal({ ...g, current: Math.max(0, (Number(g.current) || 0) - Number(a.amount)) });
    }
    setGoals(await getGoals());
  }, []);

  const addTransaction = useCallback(async (data) => {
    const { skipSavingsCut, ...rest } = data;
    const tx = await saveTransaction({ id: genId(), date: todayISO(), created_at: new Date().toISOString(), ...rest });
    setTransactions((prev) => [tx, ...prev]);
    // New income: ask whether to save 30% of it (only if a goal still needs money).
    if (tx.type === 'income' && !skipSavingsCut && goalsInTurnOrder(await getGoals(), null).length) setSavingsQueue((q) => (q.some((x) => x.id === tx.id) ? q : [...q, tx]));
    const [ws, bs] = await Promise.all([getWallets(), getBudgets()]); setWallets(ws); setBudgets(bs); return tx;
  }, []);

  // Answers to the savings question.
  const confirmSavingsCut = useCallback(async (amount) => {
    const deposit = pendingSavings;
    setSavingsQueue((q) => q.slice(1));
    if (!deposit || !(Number(amount) > 0)) return;
    const saveTx = await saveCutFromDeposit(deposit, amount);
    if (saveTx) setTransactions((prev) => [saveTx, ...prev]);
    const [ws, bs] = await Promise.all([getWallets(), getBudgets()]); setWallets(ws); setBudgets(bs);
  }, [pendingSavings, saveCutFromDeposit]);
  const skipSavingsCut = useCallback(() => setSavingsQueue((q) => q.slice(1)), []);

  // Binance wallet = the live Binance portfolio total (read-only API), refreshed every 5 minutes while the
  // app is open. The latest breakdown is kept in settings for the wallet card.
  useEffect(() => {
    if (loading) return undefined;
    let stopped = false;
    const sync = async () => {
      if (document.visibilityState !== 'visible') return;
      const w = walletsRef.current.find((x) => x.type === 'crypto' && /binance/i.test(x.name || ''));
      if (!w) return;
      try {
        const r = await fetch('/api/binance/balances', { cache: 'no-store' });
        const j = await r.json();
        if (stopped || !r.ok || !j.configured || !(Number(j.totalUsdt) >= 0)) return;
        const total = Math.round(Number(j.totalUsdt) * 100) / 100;
        const top = (j.assets || []).filter((a) => a.usdtValue > 0).slice(0, 3).map((a) => ({ asset: a.asset, pct: total ? (a.usdtValue / total) * 100 : 0 }));
        await setSetting('binance_snapshot', { at: new Date().toISOString(), total, top });
        if (Math.abs(total - Number(w.balance || 0)) >= 0.01 || w.currency !== 'USD') {
          const saved = await saveWallet({ ...w, balance: total, currency: 'USD' });
          setWallets((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
        }
      } catch { /* offline: keep the last balance */ }
    };
    sync();
    const id = setInterval(sync, 5 * 60e3);
    document.addEventListener('visibilitychange', sync);
    return () => { stopped = true; clearInterval(id); document.removeEventListener('visibilitychange', sync); };
  }, [loading]);

  // Ziidi unlocks: once the 72 hours are up, move the money from Ziidi Locked to Ziidi.
  const walletsRef = useRef(wallets);
  walletsRef.current = wallets;
  useEffect(() => {
    if (loading) return undefined;
    const run = () => releaseDueUnlocks(walletsRef.current, addTransaction).catch(() => {});
    run();
    const id = setInterval(run, 5 * 60e3);
    return () => clearInterval(id);
  }, [loading, addTransaction]);
  const removeTransaction = useCallback(async (id) => {
    // A transaction's fee (id + "_fee") and savings cut (id + "_save") go with
    // it, so balances and goals stay right.
    const ids = [id, `${id}_fee`, `${id}_save`];
    const main = await getTransaction(id);
    for (const tid of ids) {
      const t = await getTransaction(tid);
      if (!t) continue;
      await undoSavingsCut(t);
      await deleteTransaction(tid);
    }
    setTransactions((prev) => prev.filter((x) => !ids.includes(x.id)));
    // Deleting a loan payment puts that amount back on the loan.
    const loanId = loanIdFromPaymentTx(id);
    if (main && loanId) {
      const loan = (await getLoans()).find((l) => l.id === loanId);
      if (loan) {
        const remaining = Math.min(Number(loan.amount), Number(loan.remaining || 0) + Number(main.amount));
        const l = await saveLoan({ ...loan, remaining, status: 'active', settled_txn_id: null });
        setLoans((p) => p.map((x) => (x.id === l.id ? l : x)));
      }
    }
    const [ws, bs] = await Promise.all([getWallets(), getBudgets()]); setWallets(ws); setBudgets(bs);
  }, [undoSavingsCut]);

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

  // ─── CHALLENGES ───────────────────────────────────────────────��────────────
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

  // ─── PROJECTS (Showroom) ───────────────────────────────────────────────────
  const addProject = useCallback(async (data) => { const p = await saveProject({ id: genId(), created_at: new Date().toISOString(), ...data }); setProjects((prev) => [...prev, p]); return p; }, []);
  const updateProject = useCallback(async (project) => { const p = await saveProject(project); setProjects((prev) => prev.map((x) => (x.id === p.id ? p : x))); return p; }, []);
  const removeProject = useCallback(async (id) => { await deleteProject(id); setProjects((prev) => prev.filter((x) => x.id !== id)); }, []);

  // ─── CLIENT PROJECTS / TECH HUB PAID WORK ───────────────────────────────
  const addClientProject = useCallback(async (data) => { const p = await saveClientProject({ id: genId(), status: 'active', payment_plan: 'installments', agreed_amount: 0, previously_paid: 0, payments: [], change_requests: [], ...data }); const all = await getClientProjects(); setClientProjects(all); return p; }, []);
  const updateClientProject = useCallback(async (project) => { const p = await saveClientProject(project); setClientProjects((prev) => prev.map((x) => x.id === p.id ? p : x)); return p; }, []);
  const removeClientProject = useCallback(async (id) => { await deleteClientProject(id); setClientProjects((prev) => prev.filter((x) => x.id !== id)); }, []);

  // ─── CERTIFICATES ──────────────────────────────────────────────────────────
  const addCertificate = useCallback(async (data) => { const c = await saveCertificate({ id: genId(), created_at: new Date().toISOString(), ...data }); setCertificates((prev) => [c, ...prev]); return c; }, []);
  const updateCertificate = useCallback(async (cert) => { const c = await saveCertificate(cert); setCertificates((prev) => prev.map((x) => (x.id === c.id ? c : x))); return c; }, []);
  const removeCertificate = useCallback(async (id) => { await deleteCertificate(id); setCertificates((prev) => prev.filter((x) => x.id !== id)); }, []);

  const addResearch = useCallback(async (data) => { const r = await saveResearch({ id: genId(), created_at: new Date().toISOString(), ...data }); setResearch((prev) => [r, ...prev]); return r; }, []);
  const updateResearch = useCallback(async (entry) => { const r = await saveResearch(entry); setResearch((prev) => prev.map((x) => (x.id === r.id ? r : x))); return r; }, []);
  const removeResearch = useCallback(async (id) => { await deleteResearch(id); setResearch((prev) => prev.filter((x) => x.id !== id)); }, []);

  // ─── ONLINE JOBS ───────────────────────────────────────────────────────────
  const addOnlineJob = useCallback(async (data) => { const j = await saveOnlineJob({ id: genId(), entries: [], created_at: new Date().toISOString(), ...data }); setOnlineJobs((p) => [...p, j]); return j; }, []);
  const updateOnlineJob = useCallback(async (job) => { const j = await saveOnlineJob(job); setOnlineJobs((p) => p.map((x) => (x.id === j.id ? j : x))); return j; }, []);
  const removeOnlineJob = useCallback(async (id) => { await deleteOnlineJob(id); setOnlineJobs((p) => p.filter((x) => x.id !== id)); }, []);

  // ─── LEARNING / COURSES ────────────────────────────────────────────────────
  const saveCourses = useCallback(async (next) => {
    const normalized = Array.isArray(next) ? next : [];
    await setSetting('courses', normalized);
    setCourses(normalized);
    return normalized;
  }, []);

  const addCourse = useCallback(async (data) => {
    const course = { id: genId(), created_at: new Date().toISOString(), status: 'active', priority: 3, estimated_hours: 10, weekly_hours: 3, completed_minutes: 0, modules: [], notes: '', ...data };
    const next = [...courses, course];
    await saveCourses(next);
    return course;
  }, [courses, saveCourses]);

  const updateCourse = useCallback(async (course) => {
    const next = courses.map((x) => x.id === course.id ? course : x);
    await saveCourses(next);
    return course;
  }, [courses, saveCourses]);

  const removeCourse = useCallback(async (id) => {
    await saveCourses(courses.filter((x) => x.id !== id));
  }, [courses, saveCourses]);

  // ─── SETTINGS ──────────────────────────────────────────────────────────────
  const setCurrency = useCallback(async (cur) => { await setSetting('currency', cur); setCurrencyState(cur); }, []);
  const setSavingsPlanDays = useCallback(async (days) => { await setSetting('savings_plan_days', days); setSavingsPlanDaysState(days); }, []);
  const setLastSavedGoalId = useCallback(async (id) => { await setSetting('last_saved_goal_id', id); setLastSavedGoalIdState(id); }, []);

  // ─── DERIVED ───────────────────────────────────────────────────────────────
  const totalBalance = wallets.reduce((s, w) => s + (Number(w.balance) || 0), 0);
  const totalLoaned = loans.filter((l) => l.type === 'lent' && l.status === 'active').reduce((s, l) => s + Number(l.remaining || l.amount), 0);
  const totalBorrowed = loans.filter((l) => l.type === 'borrowed' && l.status === 'active').reduce((s, l) => s + Number(l.remaining || l.amount), 0);
  const totalGoalSaved = goals.reduce((s, g) => s + (g.current || 0), 0);
  // Open loans stay out of the total. Settling one adds a transaction that
  // moves the wallet balance, so it counts from then on.
  const netWorth = totalBalance + totalGoalSaved;

  return (
    <AppContext.Provider value={{
      loading, isOnline, pendingSyncCount, currency, setCurrency, fxVersion,
      savingsPlanDays, setSavingsPlanDays, lastSavedGoalId, setLastSavedGoalId,
      pendingSavings, confirmSavingsCut, skipSavingsCut,
      wallets, addWallet, updateWallet, removeWallet,
      transactions, addTransaction, removeTransaction,
      budgets, addBudget, updateBudget, removeBudget,
      loans, addLoan, updateLoan, removeLoan,
      goals, addGoal, updateGoal, removeGoal,
      incomePlans, addIncomePlan, updateIncomePlan, removeIncomePlan,
      challenges, addChallenge, updateChallenge, removeChallenge,
      hackathons, addHackathon, updateHackathon, removeHackathon,
      startups, addStartup, updateStartup, removeStartup,
      onlineJobs, addOnlineJob, updateOnlineJob, removeOnlineJob,
      projects, addProject, updateProject, removeProject,
      certificates, addCertificate, updateCertificate, removeCertificate,
      research, addResearch, updateResearch, removeResearch,
      clientProjects, addClientProject, updateClientProject, removeClientProject,
      courses, addCourse, updateCourse, removeCourse,
      totalBalance, totalLoaned, totalBorrowed, totalGoalSaved, netWorth,
      reload: loadAll,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
