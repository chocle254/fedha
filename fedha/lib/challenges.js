// Savings challenges: templates, schedule, streaks and rewards.
//
// A challenge is split into periods (days, weeks, envelopes…). Paced
// challenges open one period at a time on a schedule, so you can't tick
// ahead; a period that opened and wasn't saved is "missed" until you catch
// up or spend a streak freeze on it. Saving a period moves real money from a
// wallet into the challenge's goal (see SavingsChallenges.js).
//
// Amounts are stored in the base currency, like every other amount.
import { localISO } from './utils';

export const MILESTONES = [
  { pct: 25,  badge: '🥉', title: 'Quarter Crusher' },
  { pct: 50,  badge: '🥈', title: 'Halfway Hero' },
  { pct: 75,  badge: '🥇', title: 'Final Stretch' },
  { pct: 100, badge: '🏆', title: 'Champion' },
];

export const FREEZE_EVERY = 7; // one streak freeze earned per 7 saves
export const MAX_FREEZES = 3;
export const LEVEL_UP = 1.25;  // next level saves 25% more

// Spending that breaks a No-Spend day by default. Bills (rent, utilities,
// transport, fees…) never count, and anything marked impulse always does.
export const NOSPEND_CATEGORY_CHOICES = ['shopping', 'entertainment', 'food', 'airtime', 'family', 'other'];
export const NOSPEND_DEFAULT = ['shopping', 'entertainment'];

// everyDays: how often a new period opens (null = no schedule, save whenever).
// everyMonths: monthly schedule instead of days.
export const CHALLENGE_TEMPLATES = [
  { id: 'spin30', name: 'Daily Spin', emoji: '🎰', tier: 'Fun', spin: true,
    blurb: 'Spin every day for a surprise amount between your min and max, then save it. 30 days.',
    periodLabel: 'day', periods: 30, everyDays: 1, defaultMin: 50, defaultMax: 500 },

  { id: 'impulsetax', name: 'Impulse Tax', emoji: '🧾', tier: 'Fun', impulse: true,
    blurb: 'Every expense you mark as impulse adds the same amount as a tax you pay into your goal.',
    periodLabel: 'impulse buy', periods: 0 },

  { id: 'jar30', name: '30-Day Money Jar', emoji: '🫙', tier: 'Quick Win',
    blurb: 'Drop the same amount into the jar every day for 30 days.',
    periodLabel: 'day', periods: 30, everyDays: 1, defaultStep: 200, stepLabel: 'Daily amount',
    amountFor: (i, step) => step },

  { id: 'sprint5k', name: '10-Day Sprint', emoji: '⚡', tier: 'Quick Win',
    blurb: '10 days, each one bigger than the last. Fast and satisfying.',
    periodLabel: 'day', periods: 10, everyDays: 1, defaultStep: 100, stepLabel: 'Base step',
    amountFor: (i, step) => step * (i + 1) },

  { id: 'roundup100', name: 'Round-Up Rush', emoji: '🔄', tier: 'Quick Win',
    blurb: 'Round a spend up to the nearest 100 and stash the difference, whenever you spend. 60 round-ups.',
    periodLabel: 'round-up', periods: 60, everyDays: null, defaultStep: 50, stepLabel: 'Avg round-up',
    amountFor: (i, step) => step },

  { id: '52week', name: '52-Week Challenge', emoji: '📈', tier: 'Classic',
    blurb: 'Save a little more each week. Week 1 one step, week 52 fifty-two.',
    periodLabel: 'week', periods: 52, everyDays: 7, defaultStep: 100, stepLabel: 'Weekly step',
    amountFor: (i, step) => step * (i + 1) },

  { id: 'fiftytwo_reverse', name: 'Reverse 52', emoji: '🪂', tier: 'Classic',
    blurb: 'Start big while motivation is high. Week 1 is the largest, then it eases down.',
    periodLabel: 'week', periods: 52, everyDays: 7, defaultStep: 100, stepLabel: 'Weekly step',
    amountFor: (i, step) => step * (52 - i) },

  { id: 'envelope100', name: '100 Envelope Challenge', emoji: '✉️', tier: 'Classic',
    blurb: 'One numbered envelope a day. Envelope 1 is one step, envelope 100 is a hundred.',
    periodLabel: 'envelope', periods: 100, everyDays: 1, defaultStep: 10, stepLabel: 'Per-envelope step',
    amountFor: (i, step) => step * (i + 1) },

  { id: 'payday12', name: 'Payday Pledge', emoji: '💰', tier: 'Classic',
    blurb: 'Pay yourself first. A fixed amount every month for a year.',
    periodLabel: 'month', periods: 12, everyMonths: 1, defaultStep: 2000, stepLabel: 'Monthly amount',
    amountFor: (i, step) => step },

  { id: 'weekend24', name: 'Weekend Warrior', emoji: '🎉', tier: 'Habit',
    blurb: 'Skip one treat every weekend and bank it instead. 24 weekends.',
    periodLabel: 'weekend', periods: 24, everyDays: 7, defaultStep: 500, stepLabel: 'Per-weekend save',
    amountFor: (i, step) => step },

  { id: 'nospend', name: 'No-Spend Sprint', emoji: '🚫', tier: 'Habit', auto: true,
    blurb: '14 days without spending on the things you pick. Bills never count. Tracked from your transactions.',
    periodLabel: 'day', periods: 14 },

  { id: 'nospend30', name: 'No-Spend Month', emoji: '🛡️', tier: 'Marathon', auto: true,
    blurb: 'The 30-day version. Bills never count. Tracked from your transactions.',
    periodLabel: 'day', periods: 30 },

  { id: 'coinaday', name: 'Coin-a-Day (365)', emoji: '🪙', tier: 'Marathon',
    blurb: 'Day 1 save one step, day 2 two… by day 365 a serious stash.',
    periodLabel: 'day', periods: 365, everyDays: 1, defaultStep: 5, stepLabel: 'Daily step',
    amountFor: (i, step) => step * (i + 1) },

  { id: 'biggoal100', name: '100-Day Big Goal', emoji: '🎯', tier: 'Marathon',
    blurb: 'A steady amount every day for 100 days toward something big.',
    periodLabel: 'day', periods: 100, everyDays: 1, defaultStep: 300, stepLabel: 'Daily amount',
    amountFor: (i, step) => step },
];

export function getTemplate(id) { return CHALLENGE_TEMPLATES.find((t) => t.id === id); }
export const isPaced = (tpl) => !!(tpl.everyDays || tpl.everyMonths);

// ─── Dates ───────────────────────────────────────────────────────────────────
function parseDay(iso) { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(iso, n) { const d = parseDay(iso); d.setDate(d.getDate() + n); return localISO(d); }

// The day period i opens.
export function periodOpens(tpl, start, i) {
  if (tpl.everyMonths) {
    const d = parseDay(start);
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + i * tpl.everyMonths);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return localISO(d);
  }
  return addDays(start, i * (tpl.everyDays || 1));
}

// How many periods have opened by `today` (all of them if unpaced).
export function openedCount(tpl, start, today) {
  if (!isPaced(tpl)) return tpl.periods;
  let n = 0;
  while (n < tpl.periods && periodOpens(tpl, start, n) <= today) n++;
  return n;
}

// ─── Amounts ─────────────────────────────────────────────────────────────────
// Amount for period i, or null for a spin that hasn't been spun yet.
export function amountAt(tpl, ch, i) {
  if (tpl.spin) { const a = ch.amounts?.[i]; return a == null ? null : Number(a); }
  if (!tpl.amountFor) return 0;
  return tpl.amountFor(i, Number(ch.step) || 0);
}
const spinAverage = (ch) => ((Number(ch.min) || 0) + (Number(ch.max) || 0)) / 2;

export function challengeTarget(tpl, ch) {
  let total = 0;
  for (let i = 0; i < tpl.periods; i++) total += amountAt(tpl, ch, i) ?? spinAverage(ch);
  return total;
}

// Spin: a whole-ish random amount between min and max (rounded to 10s when
// the range allows it, so it feels like a real number to save).
export function spinAmount(min, max, rand = Math.random) {
  const lo = Math.min(Number(min) || 0, Number(max) || 0);
  const hi = Math.max(Number(min) || 0, Number(max) || 0);
  const roundTo = hi - lo >= 100 ? 10 : 1;
  const steps = Math.floor((hi - lo) / roundTo);
  return lo + Math.floor(rand() * (steps + 1)) * roundTo;
}

// ─── Progress ────────────────────────────────────────────────────────────────
// Periods that count as saved. A save whose transaction was deleted from the
// transactions list no longer counts (txIds = Set of existing transaction ids).
export function savedSet(ch, txIds) {
  const s = new Set();
  for (const i of ch.completed || []) {
    const tx = ch.saves?.[i];
    if (!tx || !txIds || txIds.has(tx)) s.add(i);
  }
  return s;
}

// Everything the card needs for a scheduled (or unscheduled) money challenge.
export function challengeStatus(tpl, ch, today, txIds) {
  const saved = savedSet(ch, txIds);
  const frozen = new Set(ch.frozen || []);
  const covered = (i) => saved.has(i) || frozen.has(i);
  const opened = openedCount(tpl, ch.start_date || today, today);
  const paced = isPaced(tpl);

  let savedAmount = 0;
  for (const i of saved) savedAmount += amountAt(tpl, ch, i) || 0;
  const target = challengeTarget(tpl, ch);
  const allDone = Array.from({ length: tpl.periods }, (_, i) => i).every(covered);

  if (!paced) {
    let next = -1;
    for (let i = 0; i < tpl.periods; i++) if (!covered(i)) { next = i; break; }
    return { saved, frozen, opened, savedAmount, target, allDone, current: next, currentDue: next >= 0,
      missed: [], streak: 0, freezesLeft: 0, nextOpens: null, pct: pctOf(savedAmount, target) };
  }

  const current = opened - 1; // the latest period to open (today's)
  const missed = [];
  for (let i = 0; i < current; i++) if (!covered(i)) missed.push(i);

  let streak = 0;
  if (current >= 0) {
    let i = covered(current) ? current : current - 1;
    while (i >= 0 && covered(i)) { streak++; i--; }
  }

  const earned = Math.floor(saved.size / FREEZE_EVERY);
  const freezesLeft = Math.max(0, Math.min(MAX_FREEZES, earned - frozen.size));
  const nextOpens = opened < tpl.periods ? periodOpens(tpl, ch.start_date || today, opened) : null;

  return { saved, frozen, opened, savedAmount, target, allDone, current,
    currentDue: current >= 0 && !covered(current), missed, streak, freezesLeft, nextOpens,
    pct: pctOf(savedAmount, target) };
}
const pctOf = (a, t) => (t > 0 ? Math.min(100, (a / t) * 100) : 0);

// ─── No-Spend ────────────────────────────────────────────────────────────────
// A day is broken by an expense in one of the chosen categories, or by any
// expense marked impulse. Today stays "pending" until it's over.
export function breaksNoSpend(t, categories) {
  if (t.type !== 'expense') return false;
  if (t.is_impulse) return true;
  return (categories || NOSPEND_DEFAULT).includes(t.category);
}

export function noSpendStatus(tpl, ch, transactions, today) {
  const cats = ch.nospend_categories || NOSPEND_DEFAULT;
  const start = ch.start_date || today;
  const badDays = new Set(transactions.filter((t) => breaksNoSpend(t, cats)).map((t) => t.date));
  const days = [];
  for (let i = 0; i < tpl.periods; i++) {
    const date = addDays(start, i);
    let state;
    if (date > today) state = 'future';
    else if (badDays.has(date)) state = 'broken';
    else if (date === today) state = 'today';
    else state = 'clean';
    days.push({ date, state });
  }
  const clean = days.filter((d) => d.state === 'clean').length;
  const broken = days.filter((d) => d.state === 'broken').length;
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const s = days[i].state;
    if (s === 'future' || s === 'today') continue;
    if (s !== 'clean') break;
    streak++;
  }
  const finished = addDays(start, tpl.periods - 1) < today;
  return { days, clean, broken, streak, finished, pct: (clean / tpl.periods) * 100 };
}

// ─── Impulse Tax ─────────────────────────────────────────────────────────────
export function impulseTaxStatus(ch, transactions) {
  const paid = new Set(ch.paid || []);
  const items = transactions
    .filter((t) => t.type === 'expense' && t.is_impulse && t.date >= (ch.start_date || ''))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const unpaid = items.filter((t) => !paid.has(t.id));
  const owed = unpaid.reduce((s, t) => s + Number(t.amount || 0), 0);
  const savedAmount = items.filter((t) => paid.has(t.id)).reduce((s, t) => s + Number(t.amount || 0), 0);
  return { items, unpaid, owed, savedAmount };
}

// ─── Rewards ─────────────────────────────────────────────────────────────────
export function milestoneCrossed(prevPct, newPct) {
  let hit = null;
  for (const m of MILESTONES) if (prevPct < m.pct && newPct >= m.pct) hit = m;
  return hit;
}
export function earnedBadges(pct) { return MILESTONES.filter((m) => pct >= m.pct); }

// Average daily spending over the last 30 days (savings moves excluded), so
// a saved amount can be put in terms of the user's own life.
export function avgDailySpend(transactions, today) {
  const from = addDays(today, -30);
  const total = transactions
    .filter((t) => t.type === 'expense' && t.category !== 'savings' && t.date > from && t.date <= today)
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  return total / 30;
}
export function daysOfSpending(amount, transactions, today) {
  const avg = avgDailySpend(transactions, today);
  return avg > 0 ? amount / avg : 0;
}

// Settings for the next level of a finished challenge.
export function levelUpSettings(tpl, ch) {
  const r10 = (n) => Math.max(10, Math.round((Number(n) * LEVEL_UP) / 10) * 10);
  if (tpl.spin) return { min: r10(ch.min), max: r10(ch.max) };
  if (tpl.auto || tpl.impulse) return {};
  return { step: r10(ch.step) };
}
