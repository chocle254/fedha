// Paper trading on top of tracked signals. NOTHING here places a real order.
import { supabaseAdmin } from './supabaseAdmin';
import { sizePosition, rewardRisk, levelsValid, evaluateTrade, floorToStep, roundToTick, replayInterval, FEE_RATE, partialRealized } from './trading-core';
import { pushToAll } from './nestlink-push';

const BINANCE = 'https://api.binance.com/api/v3';
const filterCache = new Map();

export async function getFilters(symbol) {
  const hit = filterCache.get(symbol);
  if (hit && Date.now() - hit.at < 6 * 3600e3) return hit.filters;
  const r = await fetch(`${BINANCE}/exchangeInfo?symbol=${symbol}`, { cache: 'no-store' });
  if (!r.ok) throw new Error('exchangeInfo failed');
  const info = (await r.json()).symbols?.[0];
  if (!info) throw new Error('unknown symbol');
  const lot = info.filters.find((f) => f.filterType === 'LOT_SIZE') || {};
  const notional = info.filters.find((f) => f.filterType === 'NOTIONAL' || f.filterType === 'MIN_NOTIONAL') || {};
  const pf = info.filters.find((f) => f.filterType === 'PRICE_FILTER') || {};
  const filters = { minQty: Number(lot.minQty), stepSize: Number(lot.stepSize), minNotional: Number(notional.minNotional) || 0, tickSize: Number(pf.tickSize) || 0, base: info.baseAsset, quote: info.quoteAsset };
  filterCache.set(symbol, { at: Date.now(), filters });
  return filters;
}

// Best bid and ask: a market buy fills at the ask, a market sell at the bid. The gap between them is the spread.
export async function fetchBook(symbol) {
  try {
    const r = await fetch(`${BINANCE}/ticker/bookTicker?symbol=${symbol}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    const bid = Number(j.bidPrice);
    const ask = Number(j.askPrice);
    return bid > 0 && ask > 0 ? { bid, ask } : null;
  } catch {
    return null;
  }
}

export const DEFAULT_SETTINGS = { auto_enabled: false, mode: 'paper', risk_usdt: 10, min_rr: 0, paper_balance: 1000, risk_mode: 'percent', risk_pct: 1 };

export async function getSettings(userId) {
  const { data } = await supabaseAdmin.from('trade_settings').select('*').eq('user_id', userId).maybeSingle();
  return { ...DEFAULT_SETTINGS, ...(data || {}) };
}

// Paper equity = starting paper balance + profit and loss of every closed paper trade.
export async function getEquity(userId, settings) {
  return (await getAccount(userId, settings)).equity;
}

// Like a Binance wallet: equity, the USDT tied up in open positions and resting orders, and what is free to trade.
export async function getAccount(userId, settings) {
  const { data } = await supabaseAdmin.from('paper_trades').select('status, side, entry, qty, pnl_usdt, notional, tp_hit, take_profits').eq('user_id', userId);
  let realized = 0;
  let locked = 0;
  for (const t of data || []) {
    if (['won', 'lost', 'expired'].includes(t.status)) realized += Number(t.pnl_usdt) || 0;
    else {
      if (t.status === 'open') realized += partialRealized(t); // TPs already hit pay into the balance straight away
      const n = (t.take_profits || []).length;
      const left = n ? Math.max(0, 1 - (t.tp_hit || 0) / n) : 1;
      locked += (Number(t.notional) || 0) * left;
    }
  }
  const equity = Number(settings.paper_balance) + realized;
  const r2 = (v) => Math.round(v * 100) / 100;
  return { equity: r2(equity), realized: r2(realized), locked: r2(locked), available: r2(Math.max(0, equity - locked)) };
}

export function riskAmount(settings, equity) {
  const v = settings.risk_mode === 'fixed' ? Number(settings.risk_usdt) : (Number(equity) * Number(settings.risk_pct)) / 100;
  return Math.round(v * 100) / 100;
}

export async function openPaperTrade({ userId, signal, riskUsdt, auto = false }) {
  if (!signal || ['won', 'lost', 'expired'].includes(signal.status)) return { ok: false, error: 'That signal is already closed.' };
  if (signal.stop_loss == null) return { ok: false, error: 'This signal has no stop-loss, so the risk cannot be sized.' };

  const settings = await getSettings(userId);
  const equity = await getEquity(userId, settings);
  const risk = riskUsdt != null && Number(riskUsdt) > 0 ? Number(riskUsdt) : riskAmount(settings, equity);
  if (!(risk > 0)) return { ok: false, error: 'Set a paper balance and risk first.' };
  if (risk > equity) return { ok: false, error: `Risk $${risk.toFixed(2)} is more than your paper equity $${equity.toFixed(2)}.` };

  const { data: existing } = await supabaseAdmin.from('paper_trades').select('id').eq('user_id', userId).eq('signal_id', signal.id).maybeSingle();
  if (existing) return { ok: false, error: 'Already entered.' };

  const buy = signal.side === 'BUY';
  const book = await fetchBook(signal.symbol);
  const spread = book ? book.ask - book.bid : 0;
  const spreadPct = book ? (spread / ((book.ask + book.bid) / 2)) * 100 : null;

  let entry = Number(signal.entry);
  const status = signal.status === 'pending' ? 'pending' : 'open';
  if (status === 'open') {
    if (book) entry = buy ? book.ask : book.bid; // market entry pays the spread
    else if (!auto) return { ok: false, error: 'Could not get the current price.' };
  }
  const tps = signal.take_profits || [];
  if (!levelsValid(signal.side, entry, tps, signal.stop_loss)) return { ok: false, error: 'Price has already moved past the targets or the stop, so this entry is no longer valid.' };

  let filters;
  try { filters = await getFilters(signal.symbol); } catch { return { ok: false, error: 'Could not load Binance lot-size rules.' }; }
  const sz = sizePosition({ entry, stop: Number(signal.stop_loss), riskUsdt: risk, filters, spread });
  if (!sz.ok) return sz;
  // Spot needs the full position value in the wallet. A tight stop can ask for more than you have, so cap the size.
  const { available } = await getAccount(userId, settings);
  const maxQty = floorToStep(available / (entry * (1 + FEE_RATE)), filters.stepSize || 1e-8);
  if (sz.qty > maxQty) {
    if (maxQty < filters.minQty || maxQty * entry < filters.minNotional) return { ok: false, error: `Not enough free paper balance ($${available.toFixed(2)} available).` };
    const dist = sz.actualRisk / sz.qty;
    sz.qty = maxQty;
    sz.notional = maxQty * entry;
    sz.actualRisk = maxQty * dist;
  }

  const row = {
    user_id: userId,
    signal_id: signal.id,
    source: signal.source,
    symbol: signal.symbol,
    side: signal.side,
    mode: 'paper',
    auto,
    entry,
    stop_loss: signal.stop_loss,
    take_profits: tps,
    qty: sz.qty,
    notional: sz.notional,
    risk_usdt: risk,
    actual_risk_usdt: sz.actualRisk,
    min_forced: sz.minForced,
    spread_abs: spread,
    spread_pct: spreadPct,
    equity_at_entry: equity,
    status,
    filled_at: status === 'open' ? new Date().toISOString() : null
  };
  const { data, error } = await supabaseAdmin.from('paper_trades').insert(row).select().single();
  if (error) return { ok: false, error: error.code === '23505' ? 'Already entered.' : 'Could not save the trade.' };
  return { ok: true, trade: data };
}

// Called right after a signal is created (Telegram listener / bot). Respects the user's automation settings.
export async function maybeAutoEnter(userId, signal) {
  try {
    const s = await getSettings(userId);
    if (!s.auto_enabled) return null;
    const rr = rewardRisk(Number(signal.entry), Number(signal.stop_loss), signal.take_profits);
    if (Number(s.min_rr) > 0 && (rr == null || rr < Number(s.min_rr))) return { ok: false, skipped: 'rr' };
    const r = await openPaperTrade({ userId, signal, auto: true });
    if (r.ok) await notify(describeEntry(r.trade), `trade-${r.trade.id}-new`);
    return r;
  } catch {
    return null;
  }
}

async function candlesSince(symbol, startMs) {
  const interval = replayInterval(Date.now() - startMs);
  const r = await fetch(`${BINANCE}/klines?symbol=${symbol}&interval=${interval}&startTime=${startMs}&limit=1000`, { cache: 'no-store' });
  if (!r.ok) return null;
  return (await r.json()).map((c) => ({ t: c[0], h: Number(c[2]), l: Number(c[3]), c: Number(c[4]) }));
}

export async function evaluateLiveTrade(trade) {
  const candles = await candlesSince(trade.symbol, new Date(trade.created_at).getTime());
  return candles ? evaluateTrade(trade, candles) : null;
}

// A manual order from the order form, like Binance Spot: MARKET fills now at the ask (buy) or bid (sell);
// LIMIT fills now if it crosses the book, otherwise it rests until price trades through it.
// SELL without holding the coin is a simulated short (Spot cannot really do that).
export async function openManualOrder({ userId, symbol, side, type, qty, quoteQty, price, stopLoss, takeProfits }) {
  if (!/^[A-Z0-9]{5,20}$/.test(symbol || '')) return { ok: false, error: 'Pick a trading pair.' };
  if (side !== 'BUY' && side !== 'SELL') return { ok: false, error: 'Side must be BUY or SELL.' };
  if (type !== 'MARKET' && type !== 'LIMIT') return { ok: false, error: 'Order type must be MARKET or LIMIT.' };
  let filters;
  try { filters = await getFilters(symbol); } catch { return { ok: false, error: `${symbol} is not a Binance Spot pair.` }; }
  const book = await fetchBook(symbol);
  if (!book) return { ok: false, error: 'Could not get the order book. Try again.' };
  const buy = side === 'BUY';

  let entry;
  let status;
  if (type === 'MARKET') { entry = buy ? book.ask : book.bid; status = 'open'; }
  else {
    const p = roundToTick(Number(price), filters.tickSize);
    if (!(p > 0)) return { ok: false, error: 'Enter a limit price.' };
    const crosses = buy ? p >= book.ask : p <= book.bid;
    entry = crosses ? (buy ? book.ask : book.bid) : p; // a crossing limit fills at the best price, like a taker
    status = crosses ? 'open' : 'pending';
  }

  const step = filters.stepSize || 1e-8;
  let q = Number(qty) > 0 ? floorToStep(Number(qty), step) : Number(quoteQty) > 0 ? floorToStep(Number(quoteQty) / entry, step) : 0;
  if (!(q > 0)) return { ok: false, error: 'Enter an amount.' };
  if (q < filters.minQty) return { ok: false, error: `Minimum amount is ${filters.minQty} ${filters.base}.` };
  if (q * entry < filters.minNotional) return { ok: false, error: `Minimum order value is ${filters.minNotional} USDT.` };

  const settings = await getSettings(userId);
  const acct = await getAccount(userId, settings);
  const cost = q * entry * (1 + FEE_RATE);
  if (cost > acct.available + 1e-6) return { ok: false, error: `Insufficient balance: needs $${cost.toFixed(2)}, $${acct.available.toFixed(2)} available.` };

  const sl = Number(stopLoss) > 0 ? roundToTick(Number(stopLoss), filters.tickSize) : null;
  const tps = (Array.isArray(takeProfits) ? takeProfits : [takeProfits]).map(Number).filter((v) => v > 0).map((v) => roundToTick(v, filters.tickSize));
  tps.sort((a, b) => (buy ? a - b : b - a));
  if (!levelsValid(side, entry, tps, sl)) return { ok: false, error: `For a ${buy ? 'buy' : 'sell'}, take-profit must be ${buy ? 'above' : 'below'} and stop-loss ${buy ? 'below' : 'above'} the entry (${entry}).` };

  const spread = book.ask - book.bid;
  const risk = sl != null ? (Math.abs(entry - sl) + spread) * q : 0;
  const row = {
    user_id: userId, signal_id: null, source: 'Manual', symbol, side, mode: 'paper', auto: false,
    entry, stop_loss: sl, take_profits: tps, qty: q, notional: q * entry,
    risk_usdt: risk || q * entry, actual_risk_usdt: risk || null, min_forced: false,
    spread_abs: spread, spread_pct: (spread / ((book.ask + book.bid) / 2)) * 100, equity_at_entry: acct.equity,
    status, filled_at: status === 'open' ? new Date().toISOString() : null
  };
  const { data, error } = await supabaseAdmin.from('paper_trades').insert(row).select().single();
  if (error) return { ok: false, error: 'Could not save the order.' };
  return { ok: true, trade: data };
}

// "Close position" at market: settle any targets hit so far, then exit the rest at the bid (long) or ask (short).
// "Cancel" a resting order that has not filled.
export async function closeOrCancel(userId, id) {
  const { data: t } = await supabaseAdmin.from('paper_trades').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
  if (!t) return { ok: false, error: 'Trade not found.' };
  if (!['open', 'pending'].includes(t.status)) return { ok: false, error: 'Already closed.' };
  const candles = await candlesSince(t.symbol, new Date(t.created_at).getTime());
  if (!candles) return { ok: false, error: 'Could not load prices. Try again.' };
  const now = evaluateTrade(t, candles);
  let patch;
  if (now.status === 'pending') {
    patch = { status: 'expired', closed_at: new Date().toISOString(), pnl_usdt: null };
  } else if (now.status !== 'open') {
    patch = now; // it already hit its stop or final target
  } else {
    const book = await fetchBook(t.symbol);
    if (!book) return { ok: false, error: 'Could not get the order book. Try again.' };
    patch = evaluateTrade(t, candles, Date.now(), { exitAt: t.side === 'BUY' ? book.bid : book.ask });
  }
  const { data, error } = await supabaseAdmin.from('paper_trades').update(patch).eq('id', id).eq('user_id', userId).select().single();
  if (error) return { ok: false, error: 'Could not update the trade.' };
  return { ok: true, trade: data };
}

// ── Live updates + notifications ─────────────────────────────────────────────────────────────────────────────
const base = (s) => String(s).replace(/USDT$/, '');
const fmt = (n) => { const v = Number(n); return v >= 100 ? v.toFixed(2) : Number(v.toPrecision(6)).toString(); };
const usd = (n) => `${n < 0 ? '-' : '+'}$${Math.abs(n).toFixed(2)}`;

// What changed between two versions of a trade, as a notification (or null).
function describeChange(old, now) {
  const name = `${base(old.symbol)} ${old.side === 'BUY' ? 'long' : 'short'}`;
  const n = (old.take_profits || []).length;
  if (['won', 'lost', 'expired'].includes(now.status) && !['won', 'lost', 'expired'].includes(old.status)) {
    if (now.pnl_usdt == null) return { title: `⌛ ${name} order expired`, body: `Limit at ${fmt(old.entry)} never filled.` };
    const icon = now.status === 'won' ? '✅' : now.status === 'lost' ? '🛑' : '⏹';
    const why = now.status === 'lost' && now.tp_hit === 0 ? 'Stop-loss hit' : now.tp_hit === n && n ? `All ${n} targets hit` : now.tp_hit ? `Stopped after TP${now.tp_hit}` : 'Closed';
    return { title: `${icon} ${name} closed ${usd(Number(now.pnl_usdt))}`, body: `${why}. Exit ${fmt(now.last_price)}.` };
  }
  if (old.status === 'pending' && now.status === 'open') {
    return { title: `📥 ${name} filled at ${fmt(old.entry)}`, body: `${old.qty} ${base(old.symbol)} · TP ${(old.take_profits || []).map(fmt).join(' / ') || '—'} · SL ${old.stop_loss != null ? fmt(old.stop_loss) : '—'}` };
  }
  if ((now.tp_hit || 0) > (old.tp_hit || 0) && now.status === 'open') {
    const k = now.tp_hit;
    const banked = partialRealized({ ...old, tp_hit: k });
    return { title: `🎯 ${name} TP${k} hit at ${fmt(old.take_profits[k - 1])}`, body: `${k}/${n} targets done, ${usd(banked)} banked so far.${k < n ? ` Next TP${k + 1} ${fmt(old.take_profits[k])}.` : ''}` };
  }
  return null;
}

export async function notify(msg, tag) {
  if (!msg) return;
  try { await pushToAll({ ...msg, tag, url: '/trading' }); } catch { /* push is best effort */ }
}

export function describeEntry(t, how = 'Auto-traded') {
  return {
    title: `${t.status === 'pending' ? '⏳' : '🚀'} ${how}: ${t.side === 'BUY' ? 'LONG' : 'SHORT'} ${base(t.symbol)}${t.status === 'pending' ? ` limit ${fmt(t.entry)}` : ` at ${fmt(t.entry)}`}`,
    body: `${t.qty} ${base(t.symbol)} ($${Number(t.notional).toFixed(2)}) · TP ${(t.take_profits || []).map(fmt).join(' / ') || '—'} · SL ${t.stop_loss != null ? fmt(t.stop_loss) : '—'} · from ${t.source}`
  };
}

// Re-score open and pending trades against fresh candles, save what changed and notify once per change.
// The conditional update (matching the old status and TP count) makes sure two callers can't both notify.
export async function refreshTrades(userId, trades) {
  const live = trades.filter((t) => t.status === 'pending' || t.status === 'open').slice(0, 30);
  const results = await Promise.allSettled(live.map((t) => evaluateLiveTrade(t)));
  const byId = {};
  await Promise.all(results.map(async (r, i) => {
    const patch = r.status === 'fulfilled' ? r.value : null;
    if (!patch) return;
    const old = live[i];
    byId[old.id] = patch;
    const msg = describeChange(old, patch);
    if (!msg) { await supabaseAdmin.from('paper_trades').update(patch).eq('id', old.id).eq('user_id', userId); return; }
    const { data } = await supabaseAdmin.from('paper_trades').update(patch).eq('id', old.id).eq('user_id', userId).eq('status', old.status).eq('tp_hit', old.tp_hit || 0).select('id');
    if (data && data.length) await notify(msg, `trade-${old.id}-${patch.status}-${patch.tp_hit}`);
  }));
  return trades.map((t) => (byId[t.id] ? { ...t, ...byId[t.id] } : t));
}
