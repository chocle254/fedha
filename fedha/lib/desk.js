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
export const DIAMOND = { winRate: 0.6 };
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

const features = (rec, trend) => { const win = windowOf(rec.at); return { ch: rec.source, win, side: rec.side, sw: `${rec.side}@${win}`, trend: withTrend(rec.side, trend) }; };

// ── Rules the Desk can score with. 'now' is the original. The others are lessons from its own misses (e.g. it judged
// "buys" and "mornings" separately, so it could not see that morning buys won while evening buys lost). Every rule
// scores every signal in the background; learnRule() switches to another rule only when it has done clearly better
// on signals it could not have seen, so one lucky day can't change how the Desk trades. ──
export const RULES = {
  now: { label: 'Channel, side and time of day', keys: ['ch', 'side', 'win'] },
  time_side: { label: '+ buys or sells at this time of day', keys: ['ch', 'side', 'win', 'sw'] },
  fresh: { label: '+ buys or sells at this time of day, the last 5 days counting most', keys: ['ch', 'side', 'win', 'sw'], half: 5 },
  recent: { label: '+ how the same side did in the last 3 hours', keys: ['ch', 'side', 'win'], recent: 3 },
};
export const ruleOf = (state) => (RULES[state?.rule] ? state.rule : 'now');

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

const swName = (v) => { const [side, win] = String(v).split('@'); return `${win ? `${win[0].toUpperCase()}${win.slice(1)} ` : ''}${side === 'BUY' ? 'buys' : 'sells'}`; };
NAME.sw = swName;
// Average R, with newer results counting more when the rule has a half-life (in days).
function avgOf(rows, at, half) {
  if (!half) return mean(rows.map((h) => h.r));
  let w = 0; let sum = 0;
  for (const h of rows) { const k = 0.5 ** ((at - h.closedAt) / (half * 86400e3)); w += k; sum += k * h.r; }
  return w ? sum / w : 0;
}

export function estimate(history, f, rule = 'now', at = Date.now()) {
  const R = RULES[rule] || RULES.now;
  const n = history.length;
  if (n < DESK.minHistory) return { verdict: 'learning', score: 50, votes: 0, mult: 0, n, rule, why: [`Learning: ${n} of ${DESK.minHistory} closed signals needed before it scores.`] };
  const base = avgOf(history, at, R.half);
  let votes = 0;
  const why = [];
  let chGroup = [];
  for (const key of R.keys) {
    const group = history.filter((h) => h.f[key] === f[key]);
    if (key === 'ch') chGroup = group;
    if (key === 'ch' && group.length < DESK.minChannel) { why.push(group.length ? `${f.ch}: only ${group.length} closed, no vote yet` : 'New channel: no record yet'); continue; }
    if (key === 'sw' && group.length < 6) continue; // too few to say anything about this side at this hour
    if (!group.length) continue;
    const avg = avgOf(group, at, R.half);
    const yes = avg > base;
    votes += yes ? 1 : -1;
    why.push(`${yes ? '👍' : '👎'} ${NAME[key](f[key])}: ${rTxt(avg)} over ${group.length}`);
  }
  if (R.recent) {
    const group = history.filter((h) => h.f.side === f.side && at - h.closedAt <= R.recent * HOUR);
    if (group.length >= 3) {
      const avg = mean(group.map((h) => h.r)); const yes = avg > base;
      votes += yes ? 1 : -1;
      why.push(`${yes ? '👍' : '👎'} ${f.side === 'BUY' ? 'Buys' : 'Sells'} in the last ${R.recent} h: ${rTxt(avg)} over ${group.length}`);
    }
  }
  const verdict = votes >= 2 ? 'take' : votes === 1 ? 'small' : 'skip';
  // 💎 Diamond: a take from a channel with a real record (4+ closed signals) that wins 60%+ of them and has not lost
  // its last two. On history (12 Nov 2026): 2 diamonds in 45 days, both won (+1.21R each). Loosening the record to
  // 1-3 closed signals finds 8 (all won) but a 1-for-1 channel proves nothing, so the bar stays at 4. Rare on
  // purpose; its live record (the 💎 row) is the real test. Only diamonds may go to the real account via the Desk.
  const chWin = chGroup.length ? chGroup.filter((h) => h.r > 0).length / chGroup.length : 0;
  const lastTwo = [...chGroup].sort((a, b) => a.closedAt - b.closedAt).slice(-2);
  const diamond = verdict === 'take' && chGroup.length >= DESK.minChannel && chWin >= DIAMOND.winRate && !(lastTwo.length === 2 && lastTwo.every((h) => h.r < 0));
  if (diamond) why.unshift(`💎 ${f.ch} wins ${Math.round(chWin * 100)}% of ${chGroup.length}`);
  return {
    verdict, diamond, votes, n, rule, base: round(base, 3), why,
    score: Math.max(0, Math.min(100, 50 + votes * 16)),
    // Real-money lot size: a "take" trades 1.5x, everything else stays off the real account.
    mult: diamond ? 1.5 : 0, // real money: diamonds only
  };
}

// Scores a signal that has just arrived. Never throws: null means "no score this time".
export async function scoreSignal(userId, { source, symbol, side, at = Date.now() }) {
  try {
    const [history, state] = await Promise.all([deskHistory(userId), deskState(userId)]);
    let series = history.series || {};
    if (!series[symbol]) series = { ...series, ...(await trendSeries([symbol], at - 5 * 86400e3).catch(() => ({}))) };
    const trend = trendAt(series, symbol, at);
    const known = history.filter((h) => h.closedAt <= at);
    const f = features({ source, side, at }, trend);
    const rule = ruleOf(state);
    const est = estimate(known, f, rule, at);
    // Every other rule scores it too, silently, so their live record builds up (lib/desk.js RULES).
    const shadow = Object.fromEntries(Object.keys(RULES).map((k) => [k, k === rule ? est.verdict : estimate(known, f, k, at).verdict]));
    return { ...est, trend, win: windowOf(at), shadow };
  } catch { return null; }
}

// What gets saved on the signal row (small).
export const deskStamp = (d) => (d ? { v: d.verdict, d: d.diamond ? 1 : 0, s: d.score, n: d.votes, t: d.trend || null, w: d.win, r: d.rule || 'now', c: d.shadow || null, why: (d.why || []).slice(0, 4) } : null);

// ── Proof on history: each past signal scored with only what had closed before it ──
const blank = () => ({ n: 0, sum: 0, wins: 0 });
const add = (b, r) => { b.n += 1; b.sum += r; if (r > 0) b.wins += 1; };
const done = (b) => ({ n: b.n, avgR: b.n ? round(b.sum / b.n) : null, totalR: round(b.sum, 1), winPct: b.n ? Math.round((b.wins / b.n) * 100) : null });

export function walkForward(history, rule = 'now') {
  const out = { take: blank(), small: blank(), skip: blank(), all: blank(), diamond: blank() };
  const seq = [];
  for (let i = 0; i < history.length; i++) {
    const rec = history[i];
    const known = history.slice(0, i).filter((h) => h.closedAt <= rec.at);
    if (known.length < DESK.minHistory) continue;
    const est = estimate(known, rec.f, rule, rec.at);
    add(out[est.verdict], rec.r); add(out.all, rec.r);
    if (est.diamond) add(out.diamond, rec.r);
    seq.push([est.verdict, rec.r]);
  }
  return { take: done(out.take), small: done(out.small), skip: done(out.skip), all: done(out.all), diamond: done(out.diamond), scored: out.all.n, total: history.length, seq };
}

// What following a rule would have made: a take trades 1.5x, a small 1x, a skip nothing (R).
const tradedR = (seq) => round(seq.reduce((t, [v, r]) => t + r * (v === 'take' ? 1.5 : v === 'small' ? 1 : 0), 0), 1);
const avgTake = (seq) => { const t = seq.filter(([v]) => v === 'take'); return t.length ? round(mean(t.map(([, r]) => r))) : null; };

// Which rule has earned the most on signals it could not have seen. A challenger replaces the rule in use only
// when it made at least 3R more over all of history AND more over the latest 60, with its takes still winning
// there. Otherwise the Desk keeps what it has.
export function learnRule(history, current = 'now') {
  const rows = Object.keys(RULES).map((k) => {
    const wf = walkForward(history, k);
    const last = wf.seq.slice(-60);
    return { rule: k, label: RULES[k].label, all: tradedR(wf.seq), last60: tradedR(last), takeAvg: avgTake(wf.seq), takeAvg60: avgTake(last), takes: wf.take.n, missed: wf.seq.filter(([v, r]) => v === 'skip' && r > 0.5).length, badPicks: wf.seq.filter(([v, r]) => v !== 'skip' && r <= -0.9).length };
  });
  const cur = rows.find((r) => r.rule === current) || rows[0];
  const better = rows.filter((r) => r.rule !== cur.rule && r.all >= cur.all + 3 && r.last60 > cur.last60 && (r.takeAvg60 ?? -1) > 0)
    .sort((a, b) => b.last60 - a.last60)[0];
  return { use: better ? better.rule : cur.rule, switched: !!better, rows, scored: rows.length ? walkForward(history, cur.rule).scored : 0 };
}

// ── Live: signals scored when they arrived, and how they ended ──
export async function liveResults(userId, history) {
  const { data } = await supabaseAdmin.from('trade_signals').select('id, source, symbol, side, status, desk, created_at')
    .eq('user_id', userId).not('desk', 'is', null).order('created_at', { ascending: false }).limit(400);
  const rById = new Map((history || []).map((h) => [h.id, h.r]));
  const out = { take: blank(), small: blank(), skip: blank(), all: blank(), diamond: blank() };
  const rows = (data || []).filter((s) => ['take', 'small', 'skip'].includes(s.desk?.v));
  for (const s of rows) {
    const r = rById.get(s.id);
    if (r == null) continue;
    add(out[s.desk.v], r); add(out.all, r);
    if (s.desk.d) add(out.diamond, r);
  }
  // Each rule's live record from its background scores (desk.c), on the same signals.
  const rules = {};
  for (const s of data || []) {
    const r = rById.get(s.id);
    if (r == null || !s.desk?.c) continue;
    for (const [k, v] of Object.entries(s.desk.c)) {
      const b = rules[k] || (rules[k] = { n: 0, traded: 0 });
      b.n += 1; b.traded += r * (v === 'take' ? 1.5 : v === 'small' ? 1 : 0);
    }
  }
  for (const b of Object.values(rules)) b.traded = round(b.traded, 1);
  const recent = (data || []).slice(0, 12).map((s) => ({ id: s.id, source: s.source, symbol: s.symbol, side: s.side, at: s.created_at, verdict: s.desk?.v, diamond: !!s.desk?.d, score: s.desk?.s, votes: s.desk?.n, why: s.desk?.why || [], status: s.status, r: rById.has(s.id) ? round(rById.get(s.id)) : null }));
  return { take: done(out.take), small: done(out.small), skip: done(out.skip), all: done(out.all), diamond: done(out.diamond), since: rows.length ? rows[rows.length - 1].created_at : null, recent, rules };
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
