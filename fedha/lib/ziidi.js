// Ziidi inside a Safaricom (M-Pesa) wallet.
//
// Money flow, as it works on the phone:
//   M-Pesa ──push──▶ Ziidi ──lock──▶ Ziidi Locked (savings)
//   Ziidi Locked ──unlock (72 h wait)──▶ Ziidi ──withdraw──▶ M-Pesa ──▶ spend
//
// Ziidi and Ziidi Locked are child wallets (parent_id = the M-Pesa wallet, pocket = 'ziidi' | 'ziidi_locked'),
// so every move is an ordinary transfer and balances stay right. An unlock is a pending request: the money stays
// in Locked until the 72 hours pass, then it is moved to Ziidi automatically.
import { getSetting, setSetting, getTransaction } from './db';

export const UNLOCK_HOURS = 72;
const KEY = 'ziidi_unlocks';

export const isPocket = (w) => !!w?.pocket;
export const pocketsOf = (wallets, parentId) => ({
  ziidi: wallets.find((w) => w.parent_id === parentId && w.pocket === 'ziidi') || null,
  locked: wallets.find((w) => w.parent_id === parentId && w.pocket === 'ziidi_locked') || null,
});
export const hasZiidi = (wallets, w) => !!pocketsOf(wallets, w.id).ziidi;

// Create the two pockets under a mobile-money wallet (opening balances are what Ziidi shows right now).
export async function enableZiidi(parent, { ziidi = 0, locked = 0 }, addWallet) {
  const base = { type: 'mobile', currency: parent.currency || 'KES', parent_id: parent.id, created_at: new Date().toISOString() };
  const a = await addWallet({ ...base, id: `${parent.id}_ziidi`, name: `${parent.name} · Ziidi`, pocket: 'ziidi', icon: '📈', color: '#10B981', balance: Number(ziidi) || 0 });
  const b = await addWallet({ ...base, id: `${parent.id}_ziidi_locked`, name: `${parent.name} · Ziidi Locked`, pocket: 'ziidi_locked', icon: '🔒', color: '#F59E0B', balance: Number(locked) || 0 });
  return { ziidi: a, locked: b };
}

// One move between pockets, recorded as a transfer (no 30% savings question: it isn't new income).
export function move(addTransaction, { from, to, amount, description }) {
  return addTransaction({ type: 'transfer', wallet_id: from.id, to_wallet_id: to.id, amount: Number(amount), description, currency: from.currency || 'KES', skipSavingsCut: true });
}

// ── 72-hour unlocks ─────────────────────────────────────────────────────────
export async function getUnlocks() { return (await getSetting(KEY, [])) || []; }

// startedAt: when the unlock was started in the M-Pesa app (defaults to now). An unlock started earlier
// releases 72 h after THAT time, so the countdown matches the phone.
export async function requestUnlock(parentId, amount, startedAt = null) {
  const list = await getUnlocks();
  const started = startedAt ? new Date(startedAt).getTime() : Date.now();
  const start = Number.isFinite(started) ? Math.min(started, Date.now()) : Date.now();
  const item = { id: `unl_${Date.now()}_${Math.round(Math.random() * 1e4)}`, parent_id: parentId, amount: Number(amount), requested_at: new Date(start).toISOString(), release_at: new Date(start + UNLOCK_HOURS * 3600e3).toISOString() };
  await setSetting(KEY, [...list, item]);
  return item;
}

export async function cancelUnlock(id) {
  await setSetting(KEY, (await getUnlocks()).filter((u) => u.id !== id));
}

// Move every unlock whose 72 hours are up from Locked to Ziidi. Safe to call often.
let releasing = false;
export async function releaseDueUnlocks(wallets, addTransaction) {
  if (releasing) return 0;
  releasing = true;
  try { return await releaseNow(wallets, addTransaction); } finally { releasing = false; }
}
async function releaseNow(wallets, addTransaction) {
  const list = await getUnlocks();
  const now = Date.now();
  const due = list.filter((u) => new Date(u.release_at).getTime() <= now);
  if (!due.length) return 0;
  await setSetting(KEY, list.filter((u) => !due.includes(u)));
  for (const u of due) {
    const { ziidi, locked } = pocketsOf(wallets, u.parent_id);
    if (!ziidi || !locked) continue;
    await move(addTransaction, { from: locked, to: ziidi, amount: Math.min(u.amount, Number(locked.balance) || 0), description: 'Ziidi unlock released (72 h)' });
  }
  return due.length;
}

// Totals for a parent wallet and for everything.
export function walletSplit(wallets, unlocks = []) {
  let spendable = 0, ziidi = 0, locked = 0, unlocking = 0;
  for (const w of wallets) {
    const b = Number(w.balance) || 0;
    if (w.pocket === 'ziidi') ziidi += b;
    else if (w.pocket === 'ziidi_locked') locked += b;
    else spendable += b;
  }
  for (const u of unlocks) unlocking += Number(u.amount) || 0;
  unlocking = Math.min(unlocking, locked);
  return { spendable, ziidi, locked: locked - unlocking, unlocking, total: spendable + ziidi + locked };
}

// ── Interest on Ziidi Locked ──────────────────────────────────────────────────────────────────────────────────
// Ziidi pays interest on locked savings every day at midnight: balance × rate ÷ 365 (6.13% a year: KSh 2,929
// locked earned ≈ KSh 0.50 a day). Luxe credits it as income into each Locked pocket, once per day (transaction id
// ziidi_int_<pocket>_<date>, so it can never be added twice). Money being unlocked doesn't earn. Settings key
// 'ziidi_interest' = { rate, since (last day credited, YYYY-MM-DD), last: { amount, date } }.
export const ZIIDI_LOCKED_RATE = 6.13;
const INT_KEY = 'ziidi_interest';
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function getInterest() {
  return { rate: ZIIDI_LOCKED_RATE, since: null, last: { amount: 0.5, date: '2026-10-29' }, ...((await getSetting(INT_KEY, null)) || {}) };
}
export async function setInterestRate(rate) {
  const cur = await getInterest();
  await setSetting(INT_KEY, { ...cur, rate: Number(rate) || ZIIDI_LOCKED_RATE });
}
export const dailyInterest = (balance, rate) => Math.round(((Number(balance) || 0) * (Number(rate) || 0)) / 100 / 365 * 100) / 100;

// Credits every midnight since the last run (up to 7 days back), on what is locked and not being unlocked.
export async function creditZiidiInterest(wallets, addTransaction) {
  const cur = await getInterest();
  const today = iso(new Date());
  if (!cur.since) { await setSetting(INT_KEY, { ...cur, since: today }); return null; } // start from tonight
  if (cur.since >= today) return null;
  const unlocks = await getUnlocks();
  const locked = (wallets || []).filter((w) => w.pocket === 'ziidi_locked');
  let last = cur.last;
  const d = new Date(`${cur.since}T12:00:00`);
  for (let i = 0; i < 7; i++) {
    d.setDate(d.getDate() + 1);
    const day = iso(d);
    if (day > today) break;
    for (const w of locked) {
      const unlocking = unlocks.filter((u) => u.parent_id === w.parent_id).reduce((s, u) => s + Number(u.amount), 0);
      const amt = dailyInterest(Math.max(0, Number(w.balance) - unlocking), cur.rate);
      if (!(amt >= 0.01)) continue;
      if (await getTransaction(`ziidi_int_${w.id}_${day}`).catch(() => null)) continue;
      await addTransaction({ id: `ziidi_int_${w.id}_${day}`, type: 'income', amount: amt, wallet_id: w.id, category: 'investment', date: day, description: `Ziidi interest (${cur.rate}% a year)`, skipSavingsCut: true }).catch(() => null);
      last = { amount: amt, date: day };
    }
  }
  await setSetting(INT_KEY, { ...cur, since: today, last });
  return last;
}
