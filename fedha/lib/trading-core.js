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
export function sizePosition({ entry, stop, riskUsdt, filters }) {
  const dist = Math.abs(entry - stop);
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

// Replays candles against a paper trade. Rules: stop counts first if stop and target share a candle;
// the position scales out equally across the take-profits; the stop stays at its original level.
// Also records how far price went AGAINST the trade (max adverse excursion).
export function evaluateTrade(trade, candles, now = Date.now()) {
  const buy = trade.side === 'BUY';
  const dir = buy ? 1 : -1;
  const entry = Number(trade.entry);
  const qty = Number(trade.qty);
  const sl = trade.stop_loss != null ? Number(trade.stop_loss) : null;
  const tps = (trade.take_profits || []).map(Number);
  const age = now - new Date(trade.created_at).getTime();
  const share = tps.length ? qty / tps.length : 0;

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

    if (sl != null && (buy ? k.l <= sl : k.h >= sl)) {
      realized += dir * (sl - entry) * remaining;
      fees += FEE_RATE * sl * remaining;
      remaining = 0;
      worst = buy ? Math.max(worst, sl) : Math.min(worst, sl);
      closedAt = k.t;
      break;
    }
    while (tpHit < tps.length && (buy ? k.h >= tps[tpHit] : k.l <= tps[tpHit])) {
      realized += dir * (tps[tpHit] - entry) * share;
      fees += FEE_RATE * tps[tpHit] * share;
      remaining -= share;
      tpHit++;
    }
    if (tps.length && tpHit === tps.length) { remaining = 0; closedAt = k.t; break; }
  }

  const last = candles.length ? candles[candles.length - 1].c : entry;
  let status;
  let pnl = null;
  if (closedAt != null) {
    pnl = realized - fees;
    status = pnl > 0 ? 'won' : 'lost';
  } else if (!filled && age > MAX_PENDING_MS) {
    status = 'expired'; closedAt = now;
  } else if (filled && age > MAX_OPEN_MS) {
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

  const risk = sl != null ? Math.abs(entry - sl) * qty : null;
  const dd = worst == null ? null : Math.max(0, dir * (entry - worst)) * qty;
  const r4 = (n) => (n == null ? null : Math.round(n * 1e4) / 1e4);
  return {
    status,
    tp_hit: tpHit,
    filled_at: filledAt,
    closed_at: closedAt != null ? new Date(closedAt).toISOString() : null,
    pnl_usdt: r4(pnl),
    last_price: last,
    max_adverse_price: worst,
    max_favorable_price: best,
    max_drawdown_usdt: r4(dd),
    max_drawdown_r: dd != null && risk ? r4(dd / risk) : null
  };
}
