// Ziidi inside a Safaricom (M-Pesa) wallet.
//
// Money flow, as it works on the phone:
//   M-Pesa ──push──▶ Ziidi ──lock──▶ Ziidi Locked (savings)
//   Ziidi Locked ──unlock (72 h wait)──▶ Ziidi ──withdraw──▶ M-Pesa ──▶ spend
//
// Ziidi and Ziidi Locked are child wallets (parent_id = the M-Pesa wallet, pocket = 'ziidi' | 'ziidi_locked'),
// so every move is an ordinary transfer and balances stay right. An unlock is a pending request: the money stays
// in Locked until the 72 hours pass, then it is moved to Ziidi automatically.
import { getSetting, setSetting } from './db';

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
