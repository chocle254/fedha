// Daily Review (pages/review.js): the planner's 📝 block, as a short questionnaire answered each night.
// Kept in ONE setting, 'daily_reviews' (newest last, last 60 nights, every text clipped) so it stays small in
// Supabase. The coach's latest read is 'review_insight' (one object, replaced each time).
// The planner reads the last review for "tomorrow's top 3" and "do differently", and the coach's plan changes.
import { getSetting, setSetting } from './db';

export const KEY = 'daily_reviews';
export const INSIGHT_KEY = 'review_insight';
const KEEP = 60;
const pad = (n) => String(n).padStart(2, '0');
export const iso = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (s, n) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return iso(d); };
// Writing it after midnight (before 4 AM) still counts for the day you just lived.
export const reviewDate = (d = new Date()) => (d.getHours() < 4 ? addDays(iso(d), -1) : iso(d));

export const BLOCKERS = [
  ['phone', '📱 Phone / scrolling'],
  ['late', '😴 Slept or woke late'],
  ['toomuch', '📋 Planned too much'],
  ['unexpected', '⚡ Something unexpected'],
  ['energy', '🔋 Low energy'],
  ['waiting', '⏳ Waiting on someone'],
  ['start', '🧭 Didn\'t know where to start'],
  ['smoke', '🌿 Weed / drinks'],
  ['people', '👥 People / visitors'],
  ['money', '💸 No money for it'],
  ['none', '✅ Nothing, it went well'],
];
export const blockerLabel = (id) => (BLOCKERS.find((b) => b[0] === id) || [id, id])[1];

const clip = (s, n) => String(s || '').trim().slice(0, n);
export function cleanReview(r) {
  return {
    date: r.date, weekday: new Date(`${r.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long' }),
    score: Math.max(1, Math.min(10, Number(r.score) || 5)), energy: r.energy || null,
    wins: clip(r.wins, 400), learned: clip(r.learned, 300), blockers: (r.blockers || []).slice(0, 6), blockerNote: clip(r.blockerNote, 200),
    differently: clip(r.differently, 200), top3: (r.top3 || []).slice(0, 3).map((x) => clip(x, 90)),
    lastPromise: r.lastPromise || null, topDone: r.topDone ?? null, topCount: r.topCount ?? null,
    planDone: r.planDone ?? null, three: !!r.three, moneyIn: Math.round(Number(r.moneyIn) || 0) || 0, at: Date.now(),
  };
}

export async function loadReviews() {
  const v = await getSetting(KEY, []).catch(() => []);
  return Array.isArray(v) ? v.sort((a, b) => a.date.localeCompare(b.date)) : [];
}
export async function saveReview(list, r) {
  const one = cleanReview(r);
  const next = [...list.filter((x) => x.date !== one.date), one].sort((a, b) => a.date.localeCompare(b.date)).slice(-KEEP);
  await setSetting(KEY, next);
  return next;
}

// What last night's review set up for today (for the planner card).
export async function forToday() {
  const [list, insight] = await Promise.all([loadReviews(), getSetting(INSIGHT_KEY, null).catch(() => null)]);
  const today = iso();
  const last = list[list.length - 1];
  const prev = last && addDays(last.date, 1) === today ? last : null;
  const fresh = insight && Date.now() - new Date(insight.at).getTime() < 7 * 864e5 ? insight : null;
  const reviewedToday = list.some((x) => x.date === reviewDate());
  return { top3: (prev?.top3 || []).filter(Boolean), differently: prev?.differently || '', changes: fresh?.plan_changes || [], reviewedToday, streak: streakOf(list) };
}

export function streakOf(list) {
  const dates = new Set(list.map((x) => x.date));
  let d = reviewDate(); if (!dates.has(d)) d = addDays(d, -1);
  let n = 0; while (dates.has(d)) { n += 1; d = addDays(d, -1); }
  return n;
}

// Numbers you can see without any AI: trend, what gets in the way, best days, promises kept.
export function analyse(list) {
  const last = (n) => list.slice(-n);
  const avg = (a) => (a.length ? a.reduce((s, x) => s + x.score, 0) / a.length : null);
  const week = last(7); const before = list.slice(-14, -7);
  const blockers = {};
  for (const r of last(30)) for (const b of r.blockers || []) if (b !== 'none') blockers[b] = (blockers[b] || 0) + 1;
  const topBlockers = Object.entries(blockers).sort((a, b) => b[1] - a[1]).slice(0, 4);
  // What a blocker does to the day: average score on days it showed up vs days it didn't.
  const cost = topBlockers.map(([b, n]) => {
    const withIt = list.filter((r) => r.blockers?.includes(b)); const without = list.filter((r) => !r.blockers?.includes(b));
    return { id: b, n, drop: withIt.length && without.length ? avg(without) - avg(withIt) : null };
  });
  const byDay = {};
  for (const r of list) (byDay[r.weekday] = byDay[r.weekday] || []).push(r.score);
  const days = Object.entries(byDay).filter(([, s]) => s.length >= 2).map(([d, s]) => [d, s.reduce((a, b) => a + b, 0) / s.length]).sort((a, b) => b[1] - a[1]);
  const energy = {};
  for (const r of list) if (r.energy) (energy[r.energy] = energy[r.energy] || []).push(r.score);
  const kept = list.filter((r) => r.lastPromise); const keptYes = kept.filter((r) => r.lastPromise === 'yes').length + 0.5 * kept.filter((r) => r.lastPromise === 'partly').length;
  const tops = list.filter((r) => r.topDone != null && r.topCount);
  const topRate = tops.length ? tops.reduce((s, r) => s + r.topDone / r.topCount, 0) / tops.length : null;
  const moneyDays = last(30).filter((r) => r.moneyIn > 0);
  return {
    count: list.length, avgWeek: avg(week), avgBefore: avg(before), topBlockers: cost,
    bestDay: days[0] || null, worstDay: days.length > 1 ? days[days.length - 1] : null,
    energy: Object.fromEntries(Object.entries(energy).map(([k, s]) => [k, s.reduce((a, b) => a + b, 0) / s.length])),
    promiseRate: kept.length ? keptYes / kept.length : null, promiseN: kept.length, topRate, topN: tops.length,
    moneyDays: moneyDays.length, moneyTotal: moneyDays.reduce((s, r) => s + r.moneyIn, 0), scores: last(14).map((r) => ({ date: r.date, score: r.score })),
  };
}

// Words that mean the night is heavier than a review: the page points to the support page first.
export const HEAVY = /suicid|kill myself|end it all|end my life|want to die|don'?t want to (live|be here)|no reason to live|hurt myself|self[- ]?harm|better off without me/i;
