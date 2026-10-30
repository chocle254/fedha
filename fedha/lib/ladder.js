// The channel ladder: Trial → Proven → Real. A channel has to earn every step, judged on fresh results each time.
//
//  Trial   Every channel is paper-traded in the main book (as before).
//  Proven  A channel that is steadily profitable and still improving moves up. From that moment it is judged ONLY
//          on its trades since promotion, and it trades in the Proven book: a fresh $1,000 paper account that
//          holds only proven channels, so losing or new channels cannot drag its results down. (The Proven book
//          is rebuilt from the same fills as the main book, so the prices are real, not a second guess.)
//  Real    A proven channel that also wins on its own in the Proven book may trade real money (still needs
//          broker_settings.allow_real, which only you can switch on). lib/broker.js checks the stage.
//
// Moving down: a proven channel that starts losing goes back to Trial; a real one that slips goes back to Proven.
// Either way it starts again from fresh results. Every move sends a phone notification.
// One signal entered twice (two legs) counts as ONE result, so a channel can't look busier than it is.
// State lives in trade_settings.broker_settings.ladder (small: a line per channel, a 40-point curve).

import { supabaseAdmin } from './supabaseAdmin';
import { getSettings, notify } from './trading';

const EVERY_MS = 10 * 60e3;
const BOOK_START = 1000;
const BOOK_RISK = 0.01; // the Proven book risks 1% of its balance per signal

export const LADDER_RULES = {
  promote: { signals: 5, avgR: 0.2, conf: 65, maxDD: 3, slip: 0.15 },
  real: { signals: 5, avgR: 0.25, conf: 70, pf: 1.3, maxDD: 3 },
  demoteProven: { minSignals: 3, streak: 3, maxDD: 4 },
  demoteReal: { minSignals: 4, streak: 3 },
};

function normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

// Closed trades → one result per signal (legs merged: total profit ÷ total risk), oldest first.
export function signalResults(trades) {
  const by = new Map();
  for (const t of trades) {
    if (!t.signal_id || !['won', 'lost'].includes(t.status)) continue;
    const risk = Number(t.actual_risk_usdt) || Number(t.risk_usdt) || 0;
    if (!(risk > 0)) continue;
    const k = t.signal_id;
    const g = by.get(k) || { pnl: 0, risk: 0, at: '' };
    g.pnl += Number(t.pnl_usdt) || 0;
    g.risk += risk;
    const at = t.closed_at || t.created_at || '';
    if (at > g.at) g.at = at;
    by.set(k, g);
  }
  return [...by.values()].map((g) => ({ r: g.pnl / g.risk, pnl: g.pnl, at: g.at })).sort((a, b) => (a.at < b.at ? -1 : 1));
}

export function ladderStats(results) {
  const n = results.length;
  if (!n) return { n: 0, avgR: 0, pnl: 0, wins: 0, losses: 0, streak: 0, conf: 50, firstAvg: 0, lastAvg: 0, maxDD: 0, pf: 0 };
  let sum = 0, sq = 0, pnl = 0, wins = 0, streak = 0, cum = 0, peak = 0, maxDD = 0, gain = 0, loss = 0;
  for (const x of results) {
    sum += x.r; sq += x.r * x.r; pnl += x.pnl;
    if (x.r > 0) { wins++; streak = 0; gain += x.r; } else { streak++; loss += -x.r; }
    cum += x.r; peak = Math.max(peak, cum); maxDD = Math.max(maxDD, peak - cum);
  }
  const avgR = sum / n;
  const sd = n > 1 ? Math.sqrt(Math.max(0, (sq - n * avgR * avgR) / (n - 1))) : 1;
  const conf = Math.round(normCdf(avgR / (Math.max(sd, 0.5) / Math.sqrt(n))) * 100);
  const half = Math.floor(n / 2);
  const avg = (a) => (a.length ? a.reduce((s, x) => s + x.r, 0) / a.length : 0);
  return {
    n, avgR, pnl, wins, losses: n - wins, streak, conf,
    firstAvg: avg(results.slice(0, half)), lastAvg: avg(results.slice(half)),
    maxDD, pf: loss > 0 ? gain / loss : gain > 0 ? 99 : 0,
  };
}

const R = LADDER_RULES;
const fmtR = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}R`;

export function canPromote(s) {
  const p = R.promote;
  return s.n >= p.signals && s.avgR >= p.avgR && s.pnl > 0 && s.conf >= p.conf && s.streak < 3 && s.maxDD <= p.maxDD
    && s.lastAvg > 0 && s.lastAvg >= s.firstAvg - p.slip;
}
export function canGoReal(s) {
  const q = R.real;
  return s.n >= q.signals && s.avgR >= q.avgR && s.pf >= q.pf && s.conf >= q.conf && s.streak < 3 && s.maxDD <= q.maxDD && s.lastAvg > 0;
}
const provenSlipping = (s) => s.streak >= R.demoteProven.streak || s.maxDD > R.demoteProven.maxDD || (s.n >= R.demoteProven.minSignals && s.avgR < 0);
const realSlipping = (s) => s.streak >= R.demoteReal.streak || (s.n >= R.demoteReal.minSignals && s.avgR < 0);

// What a channel still needs for its next step, in plain words (for the Trading page).
export function nextStepNote(stage, s) {
  if (stage === 'real') return `Trading real money. ${s.n} signal${s.n === 1 ? '' : 's'} since, ${fmtR(s.avgR)} each.`;
  const need = [];
  const rule = stage === 'proven' ? R.real : R.promote;
  if (s.n < rule.signals) need.push(`${rule.signals - s.n} more signal${rule.signals - s.n === 1 ? '' : 's'}`);
  if (s.avgR < rule.avgR) need.push(`average ${fmtR(rule.avgR)} (now ${fmtR(s.avgR)})`);
  if (s.conf < rule.conf) need.push(`${rule.conf}% confidence (now ${s.conf}%)`);
  if (stage === 'proven' && s.n >= 2 && s.pf < R.real.pf) need.push(`wins ${R.real.pf}× its losses`);
  if (s.n >= 2 && s.lastAvg <= 0) need.push('recent trades back in profit');
  if (s.streak >= 2) need.push(`a win to break ${s.streak} losses in a row`);
  return need.length ? `${stage === 'proven' ? 'For real money' : 'For Proven'}: ${need.join(', ')}.` : 'Meets the bar; moves up on the next check.';
}

// Runs from the minute tick (pages/api/trading/tick.js), at most every 10 minutes unless forced.
export async function evaluateLadder(userId, { force = false } = {}) {
  const settings = await getSettings(userId);
  const bs = settings.broker_settings || {};
  const prev = bs.ladder || { channels: {} };
  if (!force && prev.checkedAt && Date.now() - new Date(prev.checkedAt).getTime() < EVERY_MS) return { skipped: 'recent' };

  const { data: rows } = await supabaseAdmin.from('paper_trades')
    .select('signal_id, source, status, pnl_usdt, risk_usdt, actual_risk_usdt, closed_at, created_at, book')
    .eq('user_id', userId).not('signal_id', 'is', null).in('status', ['won', 'lost'])
    .order('closed_at', { ascending: false }).limit(3000);
  const bySource = {};
  for (const t of (rows || []).filter((x) => (x.book || 'main') === 'main' && x.source && x.source !== 'Manual')) {
    (bySource[t.source] = bySource[t.source] || []).push(t);
  }

  const now = new Date().toISOString();
  const channels = { ...(prev.channels || {}) };
  const moves = [];
  for (const [source, trades] of Object.entries(bySource)) {
    const c = { stage: 'trial', since: null, ...(channels[source] || {}) };
    const all = signalResults(trades);
    const fresh = c.since ? all.filter((x) => x.at > c.since) : all; // judged on results since its last move
    const s = ladderStats(fresh);
    let to = null, why = '';
    if (c.stage === 'trial' && canPromote(s)) { to = 'proven'; why = `${s.n} signals, ${fmtR(s.avgR)} each, ${s.conf}% confident, still improving.`; }
    else if (c.stage === 'proven' && canGoReal(s)) { to = 'real'; why = `On its own in the Proven book: ${s.n} signals, ${fmtR(s.avgR)} each, wins ${s.pf.toFixed(1)}× its losses, ${s.conf}% confident.`; }
    else if (c.stage === 'proven' && provenSlipping(s)) { to = 'trial'; why = s.streak >= 3 ? `${s.streak} losses in a row since promotion.` : `${fmtR(s.avgR)} per signal since promotion.`; }
    else if (c.stage === 'real' && realSlipping(s)) { to = 'proven'; why = s.streak >= 3 ? `${s.streak} real-stage losses in a row.` : `${fmtR(s.avgR)} per signal since going real.`; }
    if (to) {
      c.history = [...(c.history || []), { from: c.stage, to, at: now, why }].slice(-6);
      c.stage = to; c.since = now;
      if (to === 'proven' && c.history.at(-1).from === 'trial') c.provenAt = now;
      if (to === 'real') c.realAt = now;
      moves.push({ source, ...c.history.at(-1) });
    }
    const after = to ? ladderStats([]) : s;
    c.stats = { n: after.n, avgR: Math.round(after.avgR * 100) / 100, conf: after.conf, pf: Math.round(after.pf * 100) / 100, streak: after.streak, maxDD: Math.round(after.maxDD * 100) / 100 };
    c.note = nextStepNote(c.stage, after);
    channels[source] = c;
  }

  // The Proven book: only proven/real channels, only their trades since they were promoted, one fresh balance.
  const bookResults = [];
  for (const [source, c] of Object.entries(channels)) {
    if (!['proven', 'real'].includes(c.stage) || !c.provenAt || !bySource[source]) continue;
    for (const x of signalResults(bySource[source])) if (x.at > c.provenAt) bookResults.push({ ...x, source });
  }
  bookResults.sort((a, b) => (a.at < b.at ? -1 : 1));
  let eq = BOOK_START, peak = BOOK_START, ddPct = 0;
  const curve = [];
  for (const x of bookResults) {
    eq *= 1 + Math.max(-1.5, x.r) * BOOK_RISK;
    peak = Math.max(peak, eq);
    ddPct = Math.max(ddPct, ((peak - eq) / peak) * 100);
    curve.push(Math.round(eq * 100) / 100);
  }
  const book = {
    start: BOOK_START, equity: Math.round(eq * 100) / 100, signals: bookResults.length,
    wins: bookResults.filter((x) => x.r > 0).length, maxDdPct: Math.round(ddPct * 10) / 10, curve: curve.slice(-40),
  };

  const ladder = { checkedAt: now, channels, book };
  await supabaseAdmin.from('trade_settings').update({ broker_settings: { ...bs, ladder } }).eq('user_id', userId);

  const icon = { proven: '⭐', real: '💰', trial: '↩️' };
  for (const m of moves) {
    const up = (m.from === 'trial' && m.to === 'proven') || m.to === 'real';
    await notify({
      title: `${icon[m.to]} ${m.source} ${up ? 'moved up to' : 'moved back to'} ${m.to === 'real' ? 'Real money' : m.to === 'proven' ? 'Proven' : 'Trial'}`,
      body: `${m.why} ${m.to === 'real' ? 'It can trade your real account once real trading is switched on.' : m.to === 'proven' ? 'It now trades in the Proven book on its own, judged only from here.' : 'It starts again from fresh results.'}`,
    }, `ladder-${m.source}-${m.to}`);
  }
  return { moves, book };
}

export async function ladderStage(userId, source) {
  const s = await getSettings(userId);
  return s.broker_settings?.ladder?.channels?.[source]?.stage || 'trial';
}
