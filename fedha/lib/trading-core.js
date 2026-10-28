// Pure trading maths (no I/O) so it can be tested on its own. PAPER ONLY.
export const FEE_RATE = 0.001; // Binance Spot taker fee, 0.1% per side
const MAX_PENDING_MS = 3 * 86400e3;
const MAX_OPEN_MS = 7 * 86400e3;

function decimals(step) {
  const s = String(step);
  if (s.includes('e-')) return Number(s.split('e-')[1]);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}
export function floorToStep(v, step) { return Number((Math.floor(v / step + 1e-9) * step).toFixed(decimals(step))); }
export function ceilToStep(v, step) { return Number((Math.ceil(v / step - 1e-9) * step).toFixed(decimals(step))); }

// Size a position so that hitting the stop loses about riskUsdt, then respect Binance's lot rules.
export function sizePosition({ entry, stop, riskUsdt, filters, spread = 0 }) {
  // A stop-loss exits at the stop minus (long) or plus (short) the spread, so that cost is part of the risk per unit.
  const dist = Math.abs(entry - stop) + Math.max(0, Number(spread) || 0);
  if (!(dist > 0)) return { ok: false, error: 'Stop-loss is the same as the entry.' };
  const step = Number(filters.stepSize) || 1e-8;
  const minQty = Number(filters.minQty) || 0;
  const minNotional = Number(filters.minNotional) || 0;
  let qty = floorToStep(riskUsdt / dist, step);
  let minForced = false;
  if (qty < minQty) { qty = ceilToStep(minQty, step); minForced = true; }
  if (qty * entry < minNotional) { qty = ceilToStep(minNotional / entry, step); minForced = true; }
  const notional = qty * entry;
  const actualRisk = qty * dist;
  return { ok: true, qty, notional, actualRisk, minForced, riskMultiple: actualRisk / riskUsdt };
}

// Reward-to-risk using the first take-profit.
export function rewardRisk(entry, stop, tps) {
  const risk = Math.abs(entry - stop);
  if (!(risk > 0) || !tps?.length) return null;
  return Math.abs(Number(tps[0]) - entry) / risk;
}

export function levelsValid(side, entry, tps, sl) {
  const buy = side === 'BUY';
  if ((tps || []).some((tp) => (buy ? Number(tp) <= entry : Number(tp) >= entry))) return false;
  if (sl != null && (buy ? Number(sl) >= entry : Number(sl) <= entry)) return false;
  return true;
}

// Stepped trailing stop for signal trades: after TP1 the stop moves to the entry (break-even), after TP2 to TP1,
// after TP3 to TP2, and so on. Returns the stop that applies once `tpHit` targets are done.
export function trailStop(entry, sl, tps, tpHit) {
  if (!tpHit) return sl == null ? null : Number(sl);
  return tpHit === 1 ? Number(entry) : Number(tps[tpHit - 2]);
}

// Replays candles against a paper trade. Rules: stop counts first if stop and target share a candle;
// the position scales out equally across the take-profits. Signal trades trail their stop (see trailStop);
// a stop that moves during a candle only applies from the next candle. Manual orders keep their stop.
// Also records how far price went AGAINST the trade (max adverse excursion).
// Options: exitAt = close whatever is still open at this price now (manual "Close position").
// Manual orders (no signal) behave like Binance GTC orders: they never expire on their own.
export function evaluateTrade(trade, candles, now = Date.now(), { exitAt = null } = {}) {
  const manual = trade.source === 'Manual';
  const buy = trade.side === 'BUY';
  const dir = buy ? 1 : -1;
  const entry = Number(trade.entry);
  const qty = Number(trade.qty);
  const sl = trade.stop_loss != null ? Number(trade.stop_loss) : null;
  const tps = (trade.take_profits || []).map(Number);
  const trailing = !manual && sl != null;
  let stop = sl;
  const age = now - new Date(trade.created_at).getTime();
  const share = tps.length ? qty / tps.length : 0;
  const spread = Math.max(0, Number(trade.spread_abs) || 0);

  let filled = trade.status !== 'pending';
  let filledAt = trade.filled_at || null;
  let tpHit = 0;
  let remaining = qty;
  let realized = 0;
  let fees = filled ? FEE_RATE * entry * qty : 0;
  let closedAt = null;
  let worst = null;
  let best = null;

  for (const k of candles) {
    if (!filled) {
      if (k.l <= entry && entry <= k.h) { filled = true; filledAt = new Date(k.t).toISOString(); fees += FEE_RATE * entry * qty; }
      continue;
    }
    const adverse = buy ? k.l : k.h;
    const fav = buy ? k.h : k.l;
    if (worst === null || (buy ? adverse < worst : adverse > worst)) worst = adverse;
    if (best === null || (buy ? fav > best : fav < best)) best = fav;

    if (stop != null && (buy ? k.l <= stop : k.h >= stop)) {
      const exit = buy ? stop - spread : stop + spread; // stop-market orders fill across the spread
      realized += dir * (exit - entry) * remaining;
      fees += FEE_RATE * exit * remaining;
      remaining = 0;
      worst = buy ? Math.max(worst, stop) : Math.min(worst, stop);
      closedAt = k.t;
      break;
    }
    while (tpHit < tps.length && (buy ? k.h >= tps[tpHit] : k.l <= tps[tpHit])) {
      realized += dir * (tps[tpHit] - entry) * share;
      fees += FEE_RATE * tps[tpHit] * share;
      remaining -= share;
      tpHit++;
    }
    if (trailing) stop = trailStop(entry, sl, tps, tpHit);
    if (tps.length && tpHit === tps.length) { remaining = 0; closedAt = k.t; break; }
  }

  const last = candles.length ? candles[candles.length - 1].c : entry;
  let status;
  let pnl = null;
  if (closedAt == null && filled && Number(exitAt) > 0) {
    realized += dir * (exitAt - entry) * remaining;
    fees += FEE_RATE * exitAt * remaining;
    remaining = 0;
    closedAt = now;
  }
  if (closedAt != null) {
    pnl = realized - fees;
    status = pnl > 0 ? 'won' : 'lost';
  } else if (!manual && !filled && age > MAX_PENDING_MS) {
    status = 'expired'; closedAt = now;
  } else if (!manual && filled && age > MAX_OPEN_MS) {
    realized += dir * (last - entry) * remaining;
    fees += FEE_RATE * last * remaining;
    remaining = 0;
    pnl = realized - fees;
    status = 'expired'; closedAt = now;
  } else if (filled) {
    status = 'open';
    pnl = realized - fees + dir * (last - entry) * remaining; // marked to market
  } else {
    status = 'pending';
  }

  const risk = sl != null ? (Math.abs(entry - sl) + spread) * qty : null;
  const dd = worst == null ? null : Math.max(0, dir * (entry - worst)) * qty;
  const r4 = (n) => (n == null ? null : Math.round(n * 1e4) / 1e4);
  return {
    status,
    tp_hit: tpHit,
    filled_at: filledAt,
    closed_at: closedAt != null ? new Date(closedAt).toISOString() : null,
    pnl_usdt: r4(pnl),
    last_price: closedAt != null && Number(exitAt) > 0 ? exitAt : last,
    max_adverse_price: worst,
    max_favorable_price: best,
    max_drawdown_usdt: r4(dd),
    max_drawdown_r: dd != null && risk ? r4(dd / risk) : null
  };
}

// Binance price filter: prices must be a multiple of tickSize.
export function roundToTick(v, tick) { return tick > 0 ? Number((Math.round(v / tick) * tick).toFixed(decimals(tick))) : v; }

// Candle size for replaying a trade: 1000 candles must cover its whole life.
export function replayInterval(ageMs) {
  const h = ageMs / 3600e3;
  return h < 16 ? '1m' : h < 80 ? '5m' : h < 240 ? '15m' : h < 960 ? '1h' : '4h';
}

// Profit already banked on an open trade from the take-profits it has hit (after fees on those exits and the
// entry fee for the part that was closed). The rest of the position is still open.
export function partialRealized(t) {
  const tps = (t.take_profits || []).map(Number);
  const hit = Math.min(Number(t.tp_hit) || 0, tps.length);
  if (!hit) return 0;
  const dir = t.side === 'BUY' ? 1 : -1;
  const entry = Number(t.entry);
  const share = Number(t.qty) / tps.length;
  let r = 0;
  for (let i = 0; i < hit; i++) r += dir * (tps[i] - entry) * share - FEE_RATE * (tps[i] + entry) * share;
  return r;
}

// ─── GROUP REPORT CARD ───────────────────────────────────────────────────────
// Every signal is paper-traded on its own at the same risk, so groups can be compared fairly in R
// (R = profit ÷ the amount risked; +2R means the trade made twice what it risked, -1R is a full stop-out).
// The verdict is what the AI and the Trading page use to size real-account lots and to drop groups.
export const GROUP_MIN_TRADES = 10; // fewer closed trades than this is too little to judge

export function tradeR(t) {
  const risk = Number(t.actual_risk_usdt) || Number(t.risk_usdt) || 0;
  return risk > 0 ? (Number(t.pnl_usdt) || 0) / risk : 0;
}

// Chance that a group's true average is above 0R, from its results so far (normal approximation).
function normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

export const LOT_MIN = 0.25;  // floor while a group is being judged or after a bad patch
export const LOT_MAX = 3;     // ceiling for a proven group

export function groupReport(trades = []) {
  const map = {};
  const closedAt = (t) => t.closed_at || t.created_at || '';
  const ordered = [...trades].sort((a, b) => (closedAt(a) < closedAt(b) ? -1 : 1)); // oldest first, so streaks are real
  for (const t of ordered) {
    if (!t.signal_id || !t.source || t.source === 'Manual') continue;
    const g = map[t.source] || (map[t.source] = { source: t.source, closed: 0, open: 0, wins: 0, losses: 0, totalR: 0, sumSq: 0, bestR: 0, worstR: 0, streak: 0, worstStreak: 0, last: null });
    if (['open', 'pending'].includes(t.status)) { g.open++; continue; }
    if (!['won', 'lost'].includes(t.status)) continue;
    const r = tradeR(t);
    g.closed++;
    g.totalR += r;
    g.sumSq += r * r;
    g.bestR = Math.max(g.bestR, r);
    g.worstR = Math.min(g.worstR, r);
    if (r > 0) { g.wins++; g.streak = 0; } else { g.losses++; g.streak++; g.worstStreak = Math.max(g.worstStreak, g.streak); }
    g.last = closedAt(t) || g.last;
  }
  return Object.values(map).map((g) => {
    const n = g.closed;
    const avgR = n ? g.totalR / n : 0;
    const winRate = n ? Math.round((g.wins / n) * 100) : 0;
    // Confidence: how sure we are this group really makes money. It needs both a positive average AND
    // enough trades for that average to not be luck, so it climbs as the track record grows.
    const sd = n > 1 ? Math.sqrt(Math.max(0, (g.sumSq - n * avgR * avgR) / (n - 1))) : 1;
    const z = n ? avgR / (Math.max(sd, 0.5) / Math.sqrt(n)) : 0;
    const confidence = n ? Math.round(normCdf(z) * 100) : 50;

    // Lot multiplier grows with confidence and with the size of the edge, but the ceiling only
    // opens up as trades pile up (1× + 0.1× per closed trade), so a lucky start cannot jump to 3×.
    const edge = Math.max(0, (confidence - 50) / 50) * Math.min(1, Math.max(0, avgR) / 0.5);
    const cap = Math.min(LOT_MAX, 1 + n * 0.1);
    let lotMultiplier = Math.min(cap, 0.5 + edge * (LOT_MAX - 0.5));
    let verdict, why;
    if (n < GROUP_MIN_TRADES) {
      // Too early to judge: small size either way (0.25×–1×), leaning with how it is going so far.
      verdict = 'testing';
      lotMultiplier = Math.min(1, Math.max(LOT_MIN, lotMultiplier * (confidence / 100) * 1.5));
      why = `${n} closed trade${n === 1 ? '' : 's'}, ${confidence}% confident. Small lots until ${GROUP_MIN_TRADES} trades, then they grow with its record.`;
    } else if (confidence < 25 || avgR <= 0) {
      verdict = 'drop'; lotMultiplier = 0;
      why = `Only ${confidence}% confident it makes money (${avgR >= 0 ? '+' : ''}${avgR.toFixed(2)}R per trade over ${n}). No real money; still paper-tracked in case it recovers.`;
    } else if (lotMultiplier > 1) {
      verdict = 'scale';
      why = `${confidence}% confident over ${n} trades, ${avgR.toFixed(2)}R per trade. Lots raised.`;
    } else {
      verdict = 'keep';
      why = `${confidence}% confident over ${n} trades (${avgR >= 0 ? '+' : ''}${avgR.toFixed(2)}R per trade). Not proven enough to size up yet.`;
    }
    // A losing run cuts size straight away; it builds back up as wins return.
    if (lotMultiplier > 0 && g.streak >= 3) {
      lotMultiplier /= 2;
      why += ` Halved for now: ${g.streak} stop-losses in a row.`;
    }
    if (lotMultiplier > 0) lotMultiplier = Math.max(LOT_MIN, Math.floor(lotMultiplier * 4) / 4);
    return { ...g, avgR, winRate, confidence, verdict, lotMultiplier, why };
  }).sort((a, b) => b.confidence - a.confidence || b.avgR - a.avgR);
}

// Real-account XAUUSD lot size: standard lot = 100 oz, so a $1 move costs $100 per lot.
// riskUsd is what you are willing to lose on the trade before the group's multiplier.
export function goldLots({ riskUsd, entry, stop, multiplier = 1 }) {
  const dist = Math.abs(Number(entry) - Number(stop));
  if (!(dist > 0) || !(riskUsd > 0) || !(multiplier > 0)) return 0;
  return Math.max(0.01, Math.floor(((riskUsd * multiplier) / (dist * 100)) * 100) / 100);
}

// MT5 demo/real trades: one row per leg (one TP each). For the report card every signal on every account
// counts as ONE result once all its legs are finished, so a 6-TP signal is not counted six times.
export function brokerResults(rows = []) {
  const map = {};
  for (const r of rows) {
    const k = `${r.account}|${r.signal_key}`;
    (map[k] = map[k] || []).push(r);
  }
  const out = [];
  for (const [k, legs] of Object.entries(map)) {
    const first = legs[0];
    const live = legs.some((l) => ['pending', 'open'].includes(l.status));
    const filled = legs.filter((l) => l.profit != null && ['won', 'lost'].includes(l.status));
    if (live) { out.push({ signal_id: k, source: first.source, status: 'open' }); continue; }
    if (!filled.length) continue; // never filled (cancelled / failed): not a result
    const pnl = filled.reduce((s, l) => s + Number(l.profit || 0), 0);
    out.push({
      signal_id: k,
      source: first.source,
      account: first.account,
      status: pnl > 0 ? 'won' : 'lost',
      pnl_usdt: pnl,
      actual_risk_usdt: Number(first.risk_usd) || 0,
      closed_at: filled.map((l) => l.closed_at).filter(Boolean).sort().pop() || first.created_at,
    });
  }
  return out;
}

// Lots for one signal on an MT5 account, split into one leg per TP. Returns { legs: [{ lots, tp }], riskUsd } or { error }.
// contractSize: units per 1 lot (gold = 100 oz). minVolume / volumeStep come from the broker's symbol spec.
export function splitLots({ riskUsd, entry, stop, tps, contractSize, minVolume, volumeStep }) {
  const dist = Math.abs(Number(entry) - Number(stop));
  if (!(dist > 0)) return { error: 'Stop-loss is the same as the entry.' };
  const cs = Number(contractSize) || 1;
  const step = Number(volumeStep) || 0.01;
  const minV = Number(minVolume) || step;
  const dec = Math.max(0, Math.round(-Math.log10(step)));
  const fix = (v) => Number(v.toFixed(dec));
  const total = riskUsd / (dist * cs);
  let n = Math.min(tps.length, Math.floor(total / minV + 1e-9));
  if (n < 1) {
    // Even the smallest lot risks more than planned. Allow it only up to twice the planned risk.
    if (minV * dist * cs > riskUsd * 2) return { error: `Smallest lot (${minV}) would risk $${(minV * dist * cs).toFixed(2)}, over twice the planned $${riskUsd.toFixed(2)}.` };
    n = 1;
  }
  // Hand out whole volume steps; leftovers go to the earliest TPs (they hit most often).
  const minSteps = Math.round(minV / step);
  const steps = Math.max(n * minSteps, Math.floor(total / step + 1e-9));
  const each = Math.floor(steps / n);
  const extra = steps - each * n;
  const legs = tps.slice(0, n).map((tp, i) => ({ lots: fix((each + (i < extra ? 1 : 0)) * step), tp }));
  const lots = legs.reduce((a, l) => a + l.lots, 0);
  return { legs, riskUsd: lots * dist * cs };
}
