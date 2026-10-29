// Money in: what you earned today / this week / this month, your streak of days with money coming in, your best
// day, and the milestones worth celebrating. Pure (no database), used by the dashboard card and by the server
// when it sends an income notification.
//
// Counts as earned: income transactions (NestLink payouts, payments received, business income …).
// Not earned: transfers between your own wallets, loan money (a repayment of what someone owed you, or money you
// borrowed, incl. Fuliza), reversals and refunds.

const DAY = 864e5;
// Day keys in your time zone. The browser uses its own; the server (UTC) passes tz = 180 for Kenya (EAT).
let TZ = null;
const shift = (t) => (TZ == null ? new Date(t) : new Date(t + TZ * 60e3));
const g = (d, k) => (TZ == null ? d[`get${k}`]() : d[`getUTC${k}`]());
const localDay = (t) => { const d = shift(t); return `${g(d, 'FullYear')}-${String(g(d, 'Month') + 1).padStart(2, '0')}-${String(g(d, 'Date')).padStart(2, '0')}`; };
const dayStart = (key) => (TZ == null ? new Date(`${key}T00:00:00`).getTime() : Date.parse(`${key}T00:00:00Z`) - TZ * 60e3);

export function isEarned(tx) {
  if (!tx || tx.type !== 'income' || !(Number(tx.amount) > 0)) return false;
  const id = String(tx.id || '');
  const d = String(tx.description || '');
  if (/_loanpay_|_loanadd_/.test(id)) return false;
  if (/\b(loan|fuliza|reversal|refund|borrowed)\b/i.test(d)) return false;
  return true;
}

// Week starts Monday.
function weekStart(now) {
  const back = (g(shift(now), 'Day') + 6) % 7;
  return dayStart(localDay(now - back * DAY));
}

export function summarize(transactions, now = Date.now(), extra = 0, tz = null) {
  TZ = tz;
  const earned = (transactions || []).filter(isEarned).map((t) => ({ ...t, at: new Date(t.date || t.created_at).getTime(), amount: Number(t.amount) }));
  const byDay = new Map();
  for (const t of earned) byDay.set(localDay(t.at), (byDay.get(localDay(t.at)) || 0) + t.amount);
  if (extra > 0) byDay.set(localDay(now), (byDay.get(localDay(now)) || 0) + extra);

  const today = byDay.get(localDay(now)) || 0;
  const ws = weekStart(now);
  const ms = dayStart(`${localDay(now).slice(0, 8)}01`);
  const sumSince = (from) => [...byDay.entries()].filter(([d]) => dayStart(d) >= from).reduce((s, [, v]) => s + v, 0);
  const week = sumSince(ws);
  const month = sumSince(ms);
  const lastWeek = [...byDay.entries()].filter(([d]) => { const t = dayStart(d); return t >= ws - 7 * DAY && t < ws; }).reduce((s, [, v]) => s + v, 0);

  // Streak: days in a row with money in, ending today (or yesterday, if nothing has come in yet today).
  let streak = 0;
  for (let i = byDay.has(localDay(now)) ? 0 : 1; i < 400; i++) {
    if (byDay.get(localDay(now - i * DAY)) > 0) streak++; else break;
  }
  const past = [...byDay.entries()].filter(([d]) => d !== localDay(now));
  const bestBefore = past.reduce((b, [, v]) => Math.max(b, v), 0);
  const days14 = Array.from({ length: 14 }, (_, i) => { const d = localDay(now - (13 - i) * DAY); return { day: d, amount: byDay.get(d) || 0 }; });
  const recent = earned.sort((a, b) => b.at - a.at).slice(0, 6);
  return { weekOf: localDay(ws), today, week, month, lastWeek, streak, bestBefore, isBestDay: today > 0 && today > bestBefore && past.length >= 3, days14, recent };
}

// Weekly milestones (KES) worth their own notification.
export const MILESTONES = [1000, 2500, 5000, 10000, 20000, 35000, 50000, 75000, 100000, 150000, 250000, 500000, 1000000];
export function crossed(before, after) {
  return MILESTONES.filter((m) => before < m && after >= m).pop() || null;
}

export const kes = (n) => `KES ${Math.round(Number(n) || 0).toLocaleString('en-KE')}`;

// The line added to an income notification: "KES 2,140 in today · KES 9,870 this week · 🔥 5-day streak".
export function incomeLine(s) {
  return [`${kes(s.today)} in today`, `${kes(s.week)} this week`, s.streak >= 2 ? `🔥 ${s.streak}-day streak` : null].filter(Boolean).join(' · ');
}
