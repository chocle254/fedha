// lib/desk.js — the Desk: scores every incoming signal from your own results, before it trades.
//
// It is statistics, not a prediction of the gold price. For a new signal it asks three yes/no questions about
// how signals LIKE it have done in the main paper book (one result per signal, in R = profit ÷ risk):
//   1. Has this channel done better than the average signal? (needs 4+ closed signals, else no vote)
//   2. Has this side (buy or sell) done better than average?
//   3. Has this time of day (Nairobi) done better than average?
// Each yes is +1, each no is -1. Verdicts: take (+2 or more), small (+1), skip (0 or less), or learning (under
// 30 closed signals so far).
//
// Why votes and not a weighted estimate: tested on 171 signals (each scored only from what had closed before
// it, 10 Nov 2026), a weighted estimate picked hot streaks that then cooled (its picks did no better than the
// rest), while votes held up in both halves: +2 → +0.75R over 24, +1 → +0.21R over 22, the rest about -0.05R.
// The 1-hour trend is recorded on every score but does not vote yet: it has no track record here.
//
// The score is saved on the signal (trade_signals.desk) the moment it arrives, so "did the Desk's picks really
// do better?" is answered from results it could not have seen. walkForward() answers the same question for the
// history: every past signal is scored using only the signals that had closed before it.
//
// Real money: only when trade_settings.desk.real is switched on (Trading → Channels → The Desk) does a "take"
// let a channel below the Real stage trade the real account (lib/broker.js). Off by default.
import { supabaseAdmin } from './supabaseAdmin';
import { klines } from './market';

export const DESK = { minHistory: 30, minChannel: 4, days: 45, maxSignals: 600 };
const HOUR = 3600e3;

// Time of day in Nairobi (UTC+3, no daylight saving).
export function windowOf(ms) {
  const h = (new Date(ms).getUTCHours() + 3) % 24;
  return h >= 3 && h < 10 ? 'morning' : h >= 10 && h < 15 ? 'midday' : h >= 15 && h < 19 ? 'evening' : 'night';
}
export const WINDOW_LABEL = { morning: 'Morning (03:00-10:00)', midday: 'Midday (10:00-15:00)', evening: 'Evening (15:00-19:00)', night: 'Night (19:00-03:00)' };

const clampR = (r) => Math.max(-1.5, Math.min(4, r)); // one freak result should not steer everything
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

// ── The 1-hour trend at a moment ──
function ema(values, n) {
  const k = 2 / (n + 1); const out = []; let e = values[0];
  for (const v of values) { e = v * k + e * (1 - k); out.push(e); }
  return out;
}
// { symbol: [{ t, up }] } from 1-hour candles (EMA 8 against EMA 21), oldest first.
export async function trendSeries(symbols, fromMs) {
  const out = {};
  await Promise.all([...new Set(symbols)].slice(0, 4).map(async (symbol) => {
    const candles = await klines(symbol, { interval: '1h', startTime: fromMs - 40 * HOUR, limit: 1000 }).catch(() => null);
    if (!candles || candles.length < 25) return;
    const closes = candles.map((k) => k.c);
    const fast = ema(closes, 8); const slow = ema(closes, 21);
    out[symbol] = candles.map((k, i) => ({ t: k.t, up: i >= 21 ? fast[i] > slow[i] : null }));
  }));
  return out;
}
// The trend from the last candle that had fully closed before `ms`: 'up', 'down' or null.
export function trendAt(series, symbol, ms) {
  const s = series?.[symbol];
  if (!s) return null;
  let lo = 0; let hi = s.length - 1; let at = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (s[mid].t + HOUR <= ms) { at = mid; lo = mid + 1; } else hi = mid - 1; }
  if (at < 0 || s[at].up == null || ms - s[at].t > 6 * HOUR) return null; // stale (weekend gap) = unknown
  return s[at].up ? 'up' : 'down';
}
const withTrend = (side, trend) => (trend ? ((side === 'BUY') === (trend === 'up') ? 'with' : 'against') : null);

const features = (rec, trend) => ({ ch: rec.source, win: windowOf(rec.at), side: rec.side, trend: withTrend(rec.side, trend) });

// ── History: one record per closed signal in the main paper book ──
export async function deskHistory(userId) {
  const since = new Date(Date.now() - DESK.days * 86400e3).toISOString();
  const { data } = await supabaseAdmin.from('paper_trades')
    .select('signal_id, source, symbol, side, status, pnl_usdt, risk_usdt, actual_risk_usdt, created_at, closed_at, book')
    .eq('user_id', userId).not('signal_id', 'is', null).in('status', ['won', 'lost']).gte('created_at', since)
    .order('created_at', { ascending: false }).limit(3000);
  const by = new Map();
  for (const t of data || []) {
    if ((t.book || 'main') !== 'main') continue;
    const risk = Number(t.actual_risk_usdt) || Number(t.risk_usdt) || 0;
    if (!(risk > 0)) continue;
    const g = by.get(t.signal_id) || { id: t.signal_id, source: t.source, symbol: t.symbol, side: t.side, at: Infinity, closedAt: 0, pnl: 0, risk: 0 };
    g.pnl += Number(t.pnl_usdt) || 0; g.risk += risk;
    g.at = Math.min(g.at, Date.parse(t.created_at));
    g.closedAt = Math.max(g.closedAt, Date.parse(t.closed_at || t.created_at));
    by.set(t.signal_id, g);
  }
  const recs = [...by.values()].map((g) => ({ ...g, r: clampR(g.pnl / g.risk) })).sort((a, b) => a.at - b.at).slice(-DESK.maxSignals);
  if (!recs.length) return recs;
  const series = await trendSeries(recs.map((r) => r.symbol), recs[0].at).catch(() => ({}));
  for (const r of recs) r.f = features(r, trendAt(series, r.symbol, r.at));
  recs.series = series;
  return recs;
}

// ── The estimate: three votes ──
const NAME = { ch: (v) => v, win: (v) => `${v[0].toUpperCase()}${v.slice(1)} signals`, side: (v) => (v === 'BUY' ? 'Buys' : 'Sells') };
const rTxt = (r) => `${r >= 0 ? '+' : ''}${r.toFixed(2)}R`;

export function estimate(history, f) {
  const n = history.length;
  if (n < DESK.minHistory) return { verdict: 'learning', score: 50, votes: 0, mult: 0, n, why: [`Learning: ${n} of ${DESK.minHistory} closed signals needed before it scores.`] };
  const base = mean(history.map((h) => h.r));
  let votes = 0;
  const why = [];
  for (const key of ['ch', 'side', 'win']) {
    const group = history.filter((h) => h.f[key] === f[key]);
    if (key === 'ch' && group.length < DESK.minChannel) { why.push(group.length ? `${f.ch}: only ${group.length} closed, no vote yet` : 'New channel: no record yet'); continue; }
    if (!group.length) continue;
    const avg = mean(group.map((h) => h.r));
    const yes = avg > base;
    votes += yes ? 1 : -1;
    why.push(`${yes ? '👍' : '👎'} ${NAME[key](f[key])}: ${rTxt(avg)} over ${group.length}`);
  }
  const verdict = votes >= 2 ? 'take' : votes === 1 ? 'small' : 'skip';
  return {
    verdict, votes, n, base: round(base, 3), why,
    score: Math.max(0, Math.min(100, 50 + votes * 16)),
    // Real-money lot size: a "take" trades 1.5x, everything else stays off the real account.
    mult: verdict === 'take' ? 1.5 : 0,
  };
}

// Scores a signal that has just arrived. Never throws: null means "no score this time".
export async function scoreSignal(userId, { source, symbol, side, at = Date.now() }) {
  try {
    const history = await deskHistory(userId);
    let series = history.series || {};
    if (!series[symbol]) series = { ...series, ...(await trendSeries([symbol], at - 5 * 86400e3).catch(() => ({}))) };
    const trend = trendAt(series, symbol, at);
    const known = history.filter((h) => h.closedAt <= at);
    const est = estimate(known, features({ source, side, at }, trend));
    return { ...est, trend, win: windowOf(at) };
  } catch { return null; }
}

// What gets saved on the signal row (small).
export const deskStamp = (d) => (d ? { v: d.verdict, s: d.score, n: d.votes, t: d.trend || null, w: d.win, why: (d.why || []).slice(0, 3) } : null);

// ── Proof on history: each past signal scored with only what had closed before it ──
const blank = () => ({ n: 0, sum: 0, wins: 0 });
const add = (b, r) => { b.n += 1; b.sum += r; if (r > 0) b.wins += 1; };
const done = (b) => ({ n: b.n, avgR: b.n ? round(b.sum / b.n) : null, totalR: round(b.sum, 1), winPct: b.n ? Math.round((b.wins / b.n) * 100) : null });

export function walkForward(history) {
  const out = { take: blank(), small: blank(), skip: blank(), all: blank() };
  for (let i = 0; i < history.length; i++) {
    const rec = history[i];
    const known = history.slice(0, i).filter((h) => h.closedAt <= rec.at);
    if (known.length < DESK.minHistory) continue;
    const est = estimate(known, rec.f);
    add(out[est.verdict], rec.r); add(out.all, rec.r);
  }
  return { take: done(out.take), small: done(out.small), skip: done(out.skip), all: done(out.all), scored: out.all.n, total: history.length };
}

// ── Live: signals scored when they arrived, and how they ended ──
export async function liveResults(userId, history) {
  const { data } = await supabaseAdmin.from('trade_signals').select('id, source, symbol, side, status, desk, created_at')
    .eq('user_id', userId).not('desk', 'is', null).order('created_at', { ascending: false }).limit(400);
  const rById = new Map((history || []).map((h) => [h.id, h.r]));
  const out = { take: blank(), small: blank(), skip: blank(), all: blank() };
  const rows = (data || []).filter((s) => ['take', 'small', 'skip'].includes(s.desk?.v));
  for (const s of rows) {
    const r = rById.get(s.id);
    if (r == null) continue;
    add(out[s.desk.v], r); add(out.all, r);
  }
  const recent = (data || []).slice(0, 12).map((s) => ({ id: s.id, source: s.source, symbol: s.symbol, side: s.side, at: s.created_at, verdict: s.desk?.v, score: s.desk?.s, votes: s.desk?.n, why: s.desk?.why || [], status: s.status, r: rById.has(s.id) ? round(rById.get(s.id)) : null }));
  return { take: done(out.take), small: done(out.small), skip: done(out.skip), all: done(out.all), since: rows.length ? rows[rows.length - 1].created_at : null, recent };
}

// ── The Desk's own small state (trade_settings.desk): { real, market, reviews, review_tried } ──
export async function deskState(userId) {
  const { data } = await supabaseAdmin.from('trade_settings').select('desk').eq('user_id', userId).maybeSingle();
  return data?.desk || {};
}
export async function saveDesk(userId, patch) {
  const next = { ...(await deskState(userId)), ...patch };
  await supabaseAdmin.from('trade_settings').update({ desk: next }).eq('user_id', userId);
  return next;
}
