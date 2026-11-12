// Signal tracking (PAPER ONLY — nothing here places an order).
import { supabaseAdmin } from './supabaseAdmin';
import { parseSignal, rebaseToMarket } from './signal-parser';
import { klines, lastPrice, spotToken } from './market';
import { instrument } from './instruments';

const FILL_TOLERANCE = 0.003; // entry within 0.3% of market counts as a market entry
const MAX_PENDING_MS = 3 * 86400e3;
const MAX_OPEN_MS = 7 * 86400e3;

const fetchPrice = (symbol) => lastPrice(symbol);

function levelsError(side, entry, tps, sl) {
  const buy = side === 'BUY';
  if (tps.some((tp) => (buy ? tp <= entry : tp >= entry))) return `Take-profits must be ${buy ? 'above' : 'below'} the entry for a ${side}.`;
  if (sl != null && (buy ? sl >= entry : sl <= entry)) return `Stop-loss must be ${buy ? 'below' : 'above'} the entry for a ${side}.`;
  return null;
}

// A channel's usual distances from entry to its stop and first two targets on this market (median of its last 40
// signals), or every channel's if it has fewer than 3. Used when a signal leaves them out.
async function usualLevels(userId, source, symbol) {
  const pick = async (bySource) => {
    let q = supabaseAdmin.from('trade_signals').select('entry, stop_loss, take_profits').eq('user_id', userId).eq('symbol', symbol).not('stop_loss', 'is', null).order('created_at', { ascending: false }).limit(40);
    if (bySource) q = q.eq('source', source);
    const { data } = await q;
    return data || [];
  };
  let rows = await pick(true);
  let from = 'this channel';
  if (rows.length < 3) { rows = await pick(false); from = 'all channels'; }
  if (rows.length < 3) return null;
  const med = (a) => { const v = a.filter((x) => x > 0).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : null; };
  return {
    from,
    sl: med(rows.map((r) => Math.abs(Number(r.entry) - Number(r.stop_loss)))),
    tp1: med(rows.map((r) => Math.abs(Number(r.take_profits?.[0]) - Number(r.entry)))),
    tp2: med(rows.map((r) => Math.abs(Number(r.take_profits?.[1]) - Number(r.entry)))),
  };
}

export async function createSignal({ userId, source, text, externalId = null }) {
  // Every signal goes in at market, straight away (no limit orders waiting for the price to come back).
  const parsed = { ...parseSignal(text), now: true };
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const price = await fetchPrice(parsed.symbol);
  if (!price) return { ok: false, error: parsed.proxyOf ? `Could not get the ${parsed.symbol} price right now.` : `${parsed.symbol} is not a Binance Spot pair.` };

  let { entryLow, entryHigh, takeProfits, stopLoss } = parsed;
  let entry = parsed.entryLow != null ? (parsed.entryLow + parsed.entryHigh) / 2 : price;
  if (parsed.proxyOf && spotToken(parsed.symbol) && parsed.entryLow != null) {
    // Spot-tracking feed (gold via XAUT): the channel's own levels, no shifting.
    const buy = parsed.side === 'BUY';
    if (Math.abs(price - entry) / price > 0.02) return { ok: false, error: `${parsed.symbol} is more than 2% away from the signal's price, so it was skipped.` };
    // Market entry, as long as the price hasn't reached TP1 yet.
    const tp1 = Number(takeProfits?.[0]);
    if (Number.isFinite(tp1) && (buy ? price >= tp1 : price <= tp1)) return { ok: false, error: `Price already reached TP1 (now ${price}), too late.` };
    entry = price;
  } else if (parsed.proxyOf) {
    const rb = rebaseToMarket(parsed, price);
    if (rb.error) return { ok: false, error: rb.error };
    ({ entry, entryLow, entryHigh, takeProfits, stopLoss } = rb);
  }
  if (!parsed.proxyOf) entry = price; // market entry for pairs tracked directly too

  // Levels given in pips, and levels left out: worked out from the entry, and noted on the signal.
  const buy = parsed.side === 'BUY';
  const dir = buy ? 1 : -1;
  const dp = entry < 10 ? 5 : entry < 1000 ? 3 : 2;
  const at = (dist) => Number((entry + dir * dist).toFixed(dp));
  const pip = instrument(parsed.symbol)?.pip;
  const notes = [];
  if (pip && parsed.tpPips?.length) { takeProfits = [...(takeProfits || []), ...parsed.tpPips.map((p) => at(p * pip))].sort((a, b) => (buy ? a - b : b - a)); notes.push('targets given in pips'); }
  if (pip && parsed.slPips != null && stopLoss == null) { stopLoss = at(-parsed.slPips * pip); notes.push('stop given in pips'); }
  if (stopLoss == null || !(takeProfits || []).length) {
    const u = await usualLevels(userId, source, parsed.symbol).catch(() => null);
    if (stopLoss == null) {
      if (!u?.sl) return { ok: false, error: 'No stop-loss, and no past signals on this market to set one from.' };
      stopLoss = at(-u.sl);
      notes.push(`stop set by Luxe, ${+u.sl.toFixed(dp)} away (${u.from === 'this channel' ? "the channel's" : "all channels'"} usual)`);
    }
    if (!(takeProfits || []).length && u?.tp1) {
      takeProfits = [at(u.tp1), ...(u.tp2 && u.tp2 > u.tp1 ? [at(u.tp2)] : [])];
      notes.push(`targets set by Luxe (${u.from === 'this channel' ? "the channel's" : "all channels'"} usual)`);
    }
  }
  const bad = levelsError(parsed.side, entry, takeProfits, stopLoss);
  if (bad) return { ok: false, error: bad };

  // On the spot feed the entry is exact (market price, or the zone edge as a limit order).
  const needsFill = parsed.now ? false : parsed.proxyOf && spotToken(parsed.symbol) ? entry !== price : Math.abs(entry - price) / price > FILL_TOLERANCE;
  const row = {
    user_id: userId,
    source: String(source || 'Unknown').slice(0, 60),
    raw_text: String(text).slice(0, 2000),
    external_id: externalId ? String(externalId).slice(0, 120) : null,
    symbol: parsed.symbol,
    side: parsed.side,
    entry,
    entry_low: entryLow,
    entry_high: entryHigh,
    take_profits: takeProfits,
    stop_loss: stopLoss,
    market_price: price,
    status: needsFill ? 'pending' : 'open',
    filled_at: needsFill ? null : new Date().toISOString(),
    ...(notes.length ? { note: `Levels: ${notes.join('; ')}.` } : {}),
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
  const candles = await klines(sig.symbol, { interval, startTime: created, limit: 1000 });
  if (!candles) return null;
  return evaluateCandles(sig, candles);
}


// The channel edited its post to add the stop and targets ("GOLD SELL 4057" first, levels a few seconds later).
// If Luxe had set the levels itself, switch the signal and its open paper trades to the channel's own, shifted by
// the same gap as the entry (MT5 prices vs the feed), and re-size each trade's risk to the new stop.
export async function upgradeLevels({ userId, text, externalId }) {
  if (!externalId) return null;
  const { data: sig } = await supabaseAdmin.from('trade_signals').select('*').eq('user_id', userId).eq('external_id', String(externalId).slice(0, 120)).maybeSingle();
  if (!sig || !/set by Luxe/.test(sig.note || '') || ['won', 'lost', 'expired'].includes(sig.status)) return null;
  const p = parseSignal(text);
  if (!p.ok || p.bare || p.side !== sig.side) return null;
  const entry = Number(sig.entry);
  const ref = p.entryLow != null ? (p.entryLow + p.entryHigh) / 2 : entry;
  const delta = entry - ref;
  if (Math.abs(delta) / entry > 0.02) return null;
  const buy = sig.side === 'BUY';
  const dp = entry < 10 ? 5 : entry < 1000 ? 3 : 2;
  const pip = instrument(sig.symbol)?.pip;
  const fix = (v) => Number((v + delta).toFixed(dp));
  let sl = p.stopLoss != null ? fix(p.stopLoss) : pip && p.slPips != null ? Number((entry - (buy ? 1 : -1) * p.slPips * pip).toFixed(dp)) : Number(sig.stop_loss);
  let tps = [...(p.takeProfits || []).map(fix), ...(pip ? (p.tpPips || []).map((x) => Number((entry + (buy ? 1 : -1) * x * pip).toFixed(dp))) : [])];
  if (!tps.length) tps = sig.take_profits || [];
  tps = tps.sort((a, b) => (buy ? a - b : b - a));
  if (levelsError(sig.side, entry, tps, sl)) return null;
  await supabaseAdmin.from('trade_signals').update({ stop_loss: sl, take_profits: tps, note: "Levels: the channel's own, added in an edit." }).eq('id', sig.id);
  const { data: trades } = await supabaseAdmin.from('paper_trades').select('*').eq('signal_id', sig.id).in('status', ['open', 'pending']);
  for (const t of trades || []) {
    if ((t.tp_hit || 0) > 0) continue; // already part-closed on the old levels: leave it
    const risk = Number(t.qty) * Math.abs(Number(t.entry) - sl) * (Number(t.quote_usd) || 1);
    await supabaseAdmin.from('paper_trades').update({ stop_loss: sl, take_profits: tps, actual_risk_usdt: Math.round(risk * 100) / 100 }).eq('id', t.id);
  }
  return { id: sig.id, stop_loss: sl, take_profits: tps, trades: (trades || []).length };
}
