// Signal tracking (PAPER ONLY — nothing here places an order).
import { supabaseAdmin } from './supabaseAdmin';
import { parseSignal } from './signal-parser';

const BINANCE = 'https://api.binance.com/api/v3';
const FILL_TOLERANCE = 0.003; // entry within 0.3% of market counts as a market entry
const MAX_PENDING_MS = 3 * 86400e3;
const MAX_OPEN_MS = 7 * 86400e3;

async function fetchPrice(symbol) {
  const r = await fetch(`${BINANCE}/ticker/price?symbol=${symbol}`, { cache: 'no-store' });
  if (!r.ok) return null;
  const p = Number((await r.json()).price);
  return p > 0 ? p : null;
}

function levelsError(side, entry, tps, sl) {
  const buy = side === 'BUY';
  if (tps.some((tp) => (buy ? tp <= entry : tp >= entry))) return `Take-profits must be ${buy ? 'above' : 'below'} the entry for a ${side}.`;
  if (sl != null && (buy ? sl >= entry : sl <= entry)) return `Stop-loss must be ${buy ? 'below' : 'above'} the entry for a ${side}.`;
  return null;
}

export async function createSignal({ userId, source, text, externalId = null }) {
  const parsed = parseSignal(text);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const price = await fetchPrice(parsed.symbol);
  if (!price) return { ok: false, error: `${parsed.symbol} is not a Binance Spot pair.` };

  const entry = parsed.entryLow != null ? (parsed.entryLow + parsed.entryHigh) / 2 : price;
  const bad = levelsError(parsed.side, entry, parsed.takeProfits, parsed.stopLoss);
  if (bad) return { ok: false, error: bad };

  const needsFill = Math.abs(entry - price) / price > FILL_TOLERANCE;
  const row = {
    user_id: userId,
    source: String(source || 'Unknown').slice(0, 60),
    raw_text: String(text).slice(0, 2000),
    external_id: externalId ? String(externalId).slice(0, 120) : null,
    symbol: parsed.symbol,
    side: parsed.side,
    entry,
    entry_low: parsed.entryLow,
    entry_high: parsed.entryHigh,
    take_profits: parsed.takeProfits,
    stop_loss: parsed.stopLoss,
    market_price: price,
    status: needsFill ? 'pending' : 'open',
    filled_at: needsFill ? null : new Date().toISOString()
  };
  const { data, error } = await supabaseAdmin.from('trade_signals').insert(row).select().single();
  if (error) {
    if (error.code === '23505') return { ok: false, duplicate: true, error: 'Already tracked.' };
    return { ok: false, error: 'Could not save the signal.' };
  }
  return { ok: true, signal: data };
}

// Pure function: replays price candles against a signal and returns what changed.
// Rules (deliberately conservative): if stop and target fall in the same candle the stop counts first;
// a signal that hit TP1 and later its stop is scored at the last TP reached.
export function evaluateCandles(sig, candles, now = Date.now()) {
  const buy = sig.side === 'BUY';
  const entry = Number(sig.entry);
  const tps = (sig.take_profits || []).map(Number);
  const sl = sig.stop_loss != null ? Number(sig.stop_loss) : null;
  const pct = (level) => Math.round(((buy ? level - entry : entry - level) / entry) * 10000) / 100;
  const created = new Date(sig.created_at).getTime();
  const age = now - created;

  let filled = sig.status !== 'pending';
  let filledAt = sig.filled_at || null;
  let tpHit = 0;
  let closed = null;

  for (const k of candles) {
    if (!filled) {
      if (k.l <= entry && entry <= k.h) { filled = true; filledAt = new Date(k.t).toISOString(); }
      continue;
    }
    const slHit = sl != null && (buy ? k.l <= sl : k.h >= sl);
    if (slHit) {
      closed = tpHit > 0 ? { status: 'won', result: pct(tps[tpHit - 1]), t: k.t } : { status: 'lost', result: pct(sl), t: k.t };
      break;
    }
    while (tpHit < tps.length && (buy ? k.h >= tps[tpHit] : k.l <= tps[tpHit])) tpHit++;
    if (tps.length && tpHit === tps.length) { closed = { status: 'won', result: pct(tps[tps.length - 1]), t: k.t }; break; }
  }

  if (!closed) {
    if (!filled && age > MAX_PENDING_MS) closed = { status: 'expired', result: null, t: now };
    else if (filled && age > MAX_OPEN_MS) {
      const last = candles.length ? candles[candles.length - 1].c : entry;
      closed = tpHit > 0 ? { status: 'won', result: pct(tps[tpHit - 1]), t: now } : { status: 'expired', result: pct(last), t: now };
    }
  }

  return {
    status: closed ? closed.status : filled ? 'open' : 'pending',
    tp_hit: tpHit,
    result_pct: closed ? closed.result : null,
    filled_at: filledAt,
    closed_at: closed ? new Date(closed.t).toISOString() : null
  };
}

export async function evaluateSignal(sig) {
  const created = new Date(sig.created_at).getTime();
  const age = Date.now() - created;
  const interval = age < 16 * 3600e3 ? '1m' : age < 3 * 86400e3 ? '5m' : '15m';
  const r = await fetch(`${BINANCE}/klines?symbol=${sig.symbol}&interval=${interval}&startTime=${created}&limit=1000`, { cache: 'no-store' });
  if (!r.ok) return null;
  const candles = (await r.json()).map((c) => ({ t: c[0], h: Number(c[2]), l: Number(c[3]), c: Number(c[4]) }));
  return evaluateCandles(sig, candles);
}
