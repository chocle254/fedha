// Good days and bad days: how the signals did per calendar day, per weekday and per trading session.
// Built from the main paper book (every signal is traded there), one result per signal in R (legs merged,
// same as lib/ladder.js), so dollar sizes and balance resets don't change the picture.
//
// Honesty rule: a weekday or session only counts as a PATTERN once it has enough separate days behind it.
// One bad Monday says nothing about Mondays, so confidence is measured across days, not across signals
// (twenty signals on the same Monday are one sample of "Monday", not twenty).

import { signalResults } from './ladder';

export const DAY_RULES = { weekdayDays: 4, sessionDays: 5, good: 0.15, bad: -0.1, conf: 80 };
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// Trading sessions in UTC hours (when the signal was posted).
export const SESSIONS = [
  { key: 'asia', label: 'Asia', hours: '00–07 UTC', from: 0, to: 7 },
  { key: 'london', label: 'London', hours: '07–12 UTC', from: 7, to: 12 },
  { key: 'overlap', label: 'London + New York', hours: '12–17 UTC', from: 12, to: 17 },
  { key: 'ny', label: 'New York late', hours: '17–24 UTC', from: 17, to: 24 },
];

function normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

// Local calendar date (YYYY-MM-DD) for a time, with the viewer's offset in minutes (EAT = 180).
const localDate = (ms, tzMin) => new Date(ms + tzMin * 60e3).toISOString().slice(0, 10);

// Stats for one group: signals, win rate, average R, and how sure we are it's above (or below) zero,
// measured across its separate days.
function groupStats(rows) {
  const n = rows.length;
  if (!n) return { n: 0, days: 0, avgR: 0, winPct: 0, totalR: 0, conf: 50 };
  const byDate = new Map();
  rows.forEach((x) => byDate.set(x.date, [...(byDate.get(x.date) || []), x.r]));
  const dayAvgs = [...byDate.values()].map((l) => l.reduce((a, b) => a + b, 0) / l.length);
  const d = dayAvgs.length;
  const mean = dayAvgs.reduce((a, b) => a + b, 0) / d;
  const sd = d > 1 ? Math.sqrt(dayAvgs.reduce((a, b) => a + (b - mean) ** 2, 0) / (d - 1)) : 1;
  const totalR = rows.reduce((a, x) => a + x.r, 0);
  return {
    n, days: d,
    avgR: Math.round((totalR / n) * 100) / 100,
    totalR: Math.round(totalR * 100) / 100,
    winPct: Math.round((rows.filter((x) => x.r > 0).length / n) * 100),
    conf: d > 1 ? Math.round(normCdf(mean / (Math.max(sd, 0.3) / Math.sqrt(d))) * 100) : 50,
  };
}

// good / bad only with enough days AND a clear result; otherwise "early" (too few days) or "mixed".
function verdict(s, minDays) {
  if (s.days < minDays) return 'early';
  if (s.avgR >= DAY_RULES.good && s.conf >= DAY_RULES.conf) return 'good';
  if (s.avgR <= DAY_RULES.bad && s.conf <= 100 - DAY_RULES.conf) return 'bad';
  return 'mixed';
}

// trades: paper_trades rows (main book). tzMin: viewer's UTC offset in minutes.
export function daysReport(trades, { tzMin = 180, recentDays = 21 } = {}) {
  // signalResults keeps the latest close time; the day a signal belongs to is when it was posted.
  const opened = new Map();
  trades.forEach((t) => { if (t.signal_id && (!opened.has(t.signal_id) || t.created_at < opened.get(t.signal_id))) opened.set(t.signal_id, t.created_at); });
  const bySignal = new Map();
  trades.forEach((t) => { if (t.signal_id) bySignal.set(t.signal_id, [...(bySignal.get(t.signal_id) || []), t]); });
  const rows = [];
  for (const [id, list] of bySignal) {
    const [res] = signalResults(list);
    if (!res) continue;
    const ms = Date.parse(opened.get(id));
    if (!Number.isFinite(ms)) continue;
    const local = new Date(ms + tzMin * 60e3);
    rows.push({ r: res.r, pnl: res.pnl, date: localDate(ms, tzMin), weekday: local.getUTCDay(), hourUtc: new Date(ms).getUTCHours(), source: list[0].source });
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : 1));

  // Calendar: every day that had signals, newest first.
  const dates = [...new Set(rows.map((x) => x.date))].sort().reverse();
  const daily = dates.slice(0, recentDays).map((date) => {
    const l = rows.filter((x) => x.date === date);
    const s = groupStats(l);
    const ch = new Map();
    l.forEach((x) => ch.set(x.source, (ch.get(x.source) || 0) + x.r));
    const sorted = [...ch.entries()].sort((a, b) => b[1] - a[1]);
    return {
      date, weekday: WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()], n: s.n, winPct: s.winPct, avgR: s.avgR, totalR: s.totalR,
      best: sorted[0] && sorted[0][1] > 0 ? { source: sorted[0][0], r: Math.round(sorted[0][1] * 100) / 100 } : null,
      worst: sorted.length && sorted[sorted.length - 1][1] < 0 ? { source: sorted[sorted.length - 1][0], r: Math.round(sorted[sorted.length - 1][1] * 100) / 100 } : null,
    };
  });

  const weekdays = [1, 2, 3, 4, 5, 6, 0].map((w) => {
    const s = groupStats(rows.filter((x) => x.weekday === w));
    return { key: WEEKDAYS[w], label: WEEKDAYS[w], full: WEEKDAY_FULL[w], ...s, verdict: s.n ? verdict(s, DAY_RULES.weekdayDays) : 'none' };
  }).filter((x) => x.n);
  const sessions = SESSIONS.map((ss) => {
    const s = groupStats(rows.filter((x) => x.hourUtc >= ss.from && x.hourUtc < ss.to));
    return { key: ss.key, label: ss.label, hours: ss.hours, ...s, verdict: s.n ? verdict(s, DAY_RULES.sessionDays) : 'none' };
  }).filter((x) => x.n);

  const ranked = [...daily].filter((d) => d.n >= 3).sort((a, b) => b.totalR - a.totalR);
  return {
    from: rows[0]?.date || null, to: rows[rows.length - 1]?.date || null, signals: rows.length, dayCount: dates.length,
    daily, weekdays, sessions,
    bestDay: ranked[0] || null, worstDay: ranked.length > 1 ? ranked[ranked.length - 1] : null,
    patterns: [...weekdays, ...sessions].filter((x) => x.verdict === 'good' || x.verdict === 'bad').map((x) => ({ label: x.hours ? `${x.label} session` : `${x.full}s`, verdict: x.verdict, avgR: x.avgR, days: x.days, conf: x.conf })),
  };
}
