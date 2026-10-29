// Paper trading on top of tracked signals. NOTHING here places a real order.
import { supabaseAdmin } from './supabaseAdmin';
import { sizePosition, rewardRisk, levelsValid, evaluateTrade, floorToStep, roundToTick, replayInterval, FEE_RATE, partialRealized, groupReport, LOT_MIN, atrOf, TRAIL_DEFAULT, TRAIL_LABEL, growthTier, GROWTH_LEVERAGE } from './trading-core';
import { pushToAll } from './nestlink-push';
import { klines, bookTicker, lastPrice, isMt5, mt5Filters } from './market';
import { instrument } from './instruments';
import { newsCheck, newsReason } from './news-guard';

const BINANCE = 'https://api.binance.com/api/v3';
const filterCache = new Map();

export async function getFilters(symbol) {
  if (isMt5(symbol)) return mt5Filters(symbol);
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
  return bookTicker(symbol);
}

export const DEFAULT_SETTINGS = { auto_enabled: false, mode: 'paper', risk_usdt: 10, min_rr: 0, paper_balance: 1000, risk_mode: 'percent', risk_pct: 1 };

export async function getSettings(userId) {
  const { data } = await supabaseAdmin.from('trade_settings').select('*').eq('user_id', userId).maybeSingle();
  return { ...DEFAULT_SETTINGS, ...(data || {}) };
}

// The trailing style learned for each channel (lib/trail-learn.js writes it). Missing = the default.
export async function trailProfiles(userId) {
  const { data } = await supabaseAdmin.from('trade_settings').select('trail_profiles').eq('user_id', userId).maybeSingle();
  return data?.trail_profiles?.channels || {};
}

// Volatility at a moment: ATR of the 14 fifteen-minute candles before it.
export async function atrBefore(symbol, ms) {
  const candles = await klines(symbol, { interval: '15m', endTime: Math.floor(ms), limit: 15, at: ms });
  return candles && candles.length > 1 ? atrOf(candles) : null;
}

// Until supabase-migration-smart-trailing.sql has run, the trail_* columns do not exist: save without them.
const TRAIL_COLS = ['trail_mode', 'trail_atr', 'trail_stop'];
const missingColumn = (e) => e && (e.code === '42703' || e.code === 'PGRST204' || /trail_/.test(e.message || ''));
const withoutTrail = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !TRAIL_COLS.includes(k)));
const withoutQuoteUsd = ({ quote_usd, ...rest }) => rest; // column added by supabase-migration-quote-usd.sql
const MT5_LEVERAGE = 100;
// Paper books: 'main' (trades every signal, so every channel is measured; the report cards use only this book)
// and 'growth' (the small growth-challenge account). Rows from before supabase-migration-paper-books.sql have no book.
export const isMain = (t) => (t.book || 'main') === 'main';

// US dollars per 1 unit of a market's quote currency (1 for USD-quoted markets and crypto). Yen, CAD and CHF
// quoted forex pairs need it so profit and risk come out in dollars (stored per trade as quote_usd).
export async function quoteToUsd(symbol, price) {
  const i = instrument(symbol);
  const quote = i ? (i.quote ?? symbol.slice(3)) : 'USD';
  if (!i || !quote || quote === 'USD') return 1;
  if (symbol.startsWith('USD')) return 1 / Number(price); // USDJPY, USDCAD, USDCHF: the pair itself
  const via = await lastPrice(`USD${quote}`); // GBPJPY, EURJPY: through USDJPY
  return via ? 1 / via : null;
}

// Paper equity = starting paper balance + profit and loss of every closed paper trade.
export async function getEquity(userId, settings) {
  return (await getAccount(userId, settings)).equity;
}

// Like a Binance wallet: equity, the USDT tied up in open positions and resting orders, and what is free to trade.
export async function getAccount(userId, settings) {
  const { data } = await supabaseAdmin.from('paper_trades').select('*').eq('user_id', userId);
  let realized = 0;
  let locked = 0;
  for (const t of (data || []).filter(isMain)) {
    if (['won', 'lost', 'expired'].includes(t.status)) realized += Number(t.pnl_usdt) || 0;
    else {
      if (t.status === 'open') realized += partialRealized(t); // TPs already hit pay into the balance straight away
      // Signal trades are scored on their own (like a margin position), so they do not tie up the wallet.
      if (t.signal_id) continue;
      const n = (t.take_profits || []).length;
      const left = n ? Math.max(0, 1 - (t.tp_hit || 0) / n) : 1;
      locked += ((Number(t.notional) || 0) * left) / (isMt5(t.symbol) ? MT5_LEVERAGE : 1); // CFDs tie up margin only
    }
  }
  const equity = Number(settings.paper_balance) + realized;
  const r2 = (v) => Math.round(v * 100) / 100;
  return { equity: r2(equity), realized: r2(realized), locked: r2(locked), available: r2(Math.max(0, equity - locked)) };
}

// Growth challenge (broker_settings.growth): a fresh small balance from `since`. Equity = start + every signal
// trade's profit since then; margin = what its open trades tie up (MT5 markets at 1:1000, crypto in full).
export async function growthState(userId, g) {
  const { data: rows } = await supabaseAdmin.from('paper_trades').select('*').eq('user_id', userId)
    .not('signal_id', 'is', null).gte('created_at', g.since);
  const data = (rows || []).filter((t) => t.book === 'growth');
  let realized = 0;
  let margin = 0;
  for (const t of data) {
    if (['won', 'lost', 'expired'].includes(t.status)) { realized += Number(t.pnl_usdt) || 0; continue; }
    if (t.status === 'open') realized += partialRealized(t);
    const n = (t.take_profits || []).length;
    const left = n ? Math.max(0, 1 - (t.tp_hit || 0) / n) : 1;
    margin += ((Number(t.notional) || 0) * left) / (isMt5(t.symbol) ? GROWTH_LEVERAGE : 1);
  }
  const equity = Math.round((Number(g.start) + realized) * 100) / 100;
  const closed = data.filter((t) => ['won', 'lost', 'expired'].includes(t.status));
  return { equity, margin: Math.round(margin * 100) / 100, free: Math.max(0, equity - margin), trades: data.length, open: data.length - closed.length, wins: closed.filter((t) => Number(t.pnl_usdt) > 0).length, losses: closed.filter((t) => Number(t.pnl_usdt) < 0).length, recent: data.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 8).map((t) => ({ id: t.id, symbol: t.symbol, side: t.side, source: t.source, status: t.status, qty: t.qty, pnl: Number(t.pnl_usdt) || 0, risk: Number(t.actual_risk_usdt) || 0, at: t.created_at })) };
}

// Growth account milestones: one notification per new stage, and the big one when it reaches the target ($100
// by default): time for the real account. Recorded in broker_settings.growth.notified so each fires once.
export async function growthMilestone(userId) {
  const s = await getSettings(userId);
  const g = s.broker_settings?.growth;
  if (!g?.on) return null;
  const st = await growthState(userId, g);
  const tier = growthTier(st.equity, s.risk_pct);
  const target = Number(g.target) || 100;
  const done = { ...(g.notified || {}) };
  let msg = null;
  if (st.equity >= target && !done.target) {
    done.target = new Date().toISOString();
    msg = { title: `🎯 Growth account hit $${st.equity.toFixed(2)}`, body: `It grew from $${Number(g.start).toFixed(2)} to your $${target} target (${st.wins} wins, ${st.losses} losses). Time to start the real account with the same rules.` };
  } else if (tier.index > 0 && !done[tier.label]) {
    done[tier.label] = new Date().toISOString();
    msg = { title: `🎯 Growth account reached the ${tier.label} stage`, body: `$${st.equity.toFixed(2)} (from $${Number(g.start).toFixed(2)}). Risk per trade is now ${tier.pct}%${tier.minConf ? `, following channels ${tier.minConf}%+ confident` : ', following every channel'}.` };
  }
  if (!msg) return null;
  const next = { ...s.broker_settings, growth: { ...g, notified: done } };
  await supabaseAdmin.from('trade_settings').update({ broker_settings: next }).eq('user_id', userId);
  await notify(msg, `growth-${Object.keys(done).length}`);
  return msg;
}

export function riskAmount(settings, equity) {
  const v = settings.risk_mode === 'fixed' ? Number(settings.risk_usdt) : (Number(equity) * Number(settings.risk_pct)) / 100;
  return Math.round(v * 100) / 100;
}

// growth: { equity, free, cap } when the growth challenge is on — real broker lots (0.01 lot minimum), the
// stage's risk ceiling, and margin at 1:1000 (crypto spot needs the full amount free).
export async function openPaperTrade({ userId, signal, riskUsdt, auto = false, growth = null }) {
  if (!signal || ['won', 'lost', 'expired'].includes(signal.status)) return { ok: false, error: 'That signal is already closed.' };
  if (signal.stop_loss == null) return { ok: false, error: 'This signal has no stop-loss, so the risk cannot be sized.' };

  const settings = await getSettings(userId);
  const equity = growth ? growth.equity : await getEquity(userId, settings);
  const risk = riskUsdt != null && Number(riskUsdt) > 0 ? Number(riskUsdt) : riskAmount(settings, equity);
  if (!(risk > 0)) return { ok: false, error: 'Set a paper balance and risk first.' };
  if (risk > equity) return { ok: false, error: `Risk $${risk.toFixed(2)} is more than your paper equity $${equity.toFixed(2)}.` };

  const bookName = growth ? 'growth' : 'main';
  const { data: same } = await supabaseAdmin.from('paper_trades').select('*').eq('user_id', userId).eq('signal_id', signal.id);
  if ((same || []).some((t) => (t.book || 'main') === bookName)) return { ok: false, error: 'Already entered.' };

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
  try { filters = await getFilters(signal.symbol); } catch { return { ok: false, error: 'Could not load the lot-size rules.' }; }
  if (growth && isMt5(signal.symbol)) {
    const lotUnits = instrument(signal.symbol).lot * 0.01; // the broker's smallest lot, e.g. 1 oz of gold
    filters = { ...filters, minQty: lotUnits, stepSize: lotUnits };
  }
  const conv = await quoteToUsd(signal.symbol, entry);
  if (!(conv > 0)) return { ok: false, error: `Could not convert ${signal.symbol} to US dollars right now.` };
  // Size in the quote currency (risk ÷ conv), then report risk and value back in dollars.
  const sz0 = sizePosition({ entry, stop: Number(signal.stop_loss), riskUsdt: risk / conv, filters, spread });
  if (!sz0.ok) return sz0;
  let sz = { ...sz0, notional: sz0.notional * conv, actualRisk: sz0.actualRisk * conv };
  if (growth) {
    const lev = isMt5(signal.symbol) ? GROWTH_LEVERAGE : 1;
    if (!isMt5(signal.symbol) && sz.notional > growth.free) {
      // Crypto spot: buy only what the free balance pays for (less risk, never more).
      const step = Number(filters.stepSize) || 1e-8;
      const qty = floorToStep((growth.free * 0.98) / (entry * conv), step);
      if (!(qty > 0) || qty < Number(filters.minQty || 0) || qty * entry < Number(filters.minNotional || 0)) return { ok: false, error: `Not enough free balance ($${growth.free.toFixed(2)}) for the smallest ${signal.symbol} order.` };
      const per = sz.actualRisk / sz.qty;
      sz = { ...sz, qty, notional: qty * entry * conv, actualRisk: qty * per };
    }
    if (sz.actualRisk > growth.cap) return { ok: false, error: `Smallest lot would risk $${sz.actualRisk.toFixed(2)}, over this stage's $${growth.cap.toFixed(2)} limit.` };
    const need = sz.notional / lev;
    if (need > growth.free) return { ok: false, error: `Not enough margin: needs $${need.toFixed(2)} at 1:${lev}, free $${growth.free.toFixed(2)}.` };
  }
  // Every signal is its own trade at the same risk, whatever else is open. It is never shrunk to fit the
  // free balance, so each group is scored on equal terms (results are compared in R = profit ÷ risk).

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
    quote_usd: conv,
    status,
    filled_at: status === 'open' ? new Date().toISOString() : null,
    // Smart trailing: this channel's learned style, and the market's volatility right now.
    trail_mode: (await trailProfiles(userId))[signal.source]?.mode || TRAIL_DEFAULT,
    trail_atr: await atrBefore(signal.symbol, Date.now()),
    ...(growth ? { book: 'growth' } : {})
  };
  let { data, error } = await supabaseAdmin.from('paper_trades').insert(row).select().single();
  if (growth && error && (missingColumn(error) || error.code === '23505')) return { ok: false, error: 'Run supabase-migration-paper-books.sql to start the growth account.' };
  if (missingColumn(error)) {
    if (conv !== 1) return { ok: false, error: `Run supabase-migration-quote-usd.sql to paper-trade ${signal.symbol} (its profit is in ${instrument(signal.symbol)?.quote || 'another currency'}).` };
    ({ data, error } = await supabaseAdmin.from('paper_trades').insert(withoutQuoteUsd(row)).select().single());
    if (missingColumn(error)) ({ data, error } = await supabaseAdmin.from('paper_trades').insert(withoutTrail(withoutQuoteUsd(row))).select().single());
  }
  if (error) return { ok: false, error: error.code === '23505' ? 'Already entered.' : 'Could not save the trade.' };
  return { ok: true, trade: data };
}

// Lot multiplier for a channel from its closed paper trades (see groupReport in trading-core).
export async function channelSizing(userId, source) {
  const { data } = await supabaseAdmin.from('paper_trades')
    .select('*')
    .eq('user_id', userId).eq('source', source).not('signal_id', 'is', null).limit(1000);
  const g = groupReport((data || []).filter(isMain))[0];
  if (!g) return { mult: 0.5, confidence: 50, verdict: 'testing' };
  return { mult: g.lotMultiplier > 0 ? g.lotMultiplier : LOT_MIN, confidence: g.confidence, verdict: g.verdict };
}

// Called right after a signal is created (Telegram listener / bot). Respects the user's automation settings.
export async function maybeAutoEnter(userId, signal) {
  try {
    const s = await getSettings(userId);
    if (!s.auto_enabled) return null;
    const rr = rewardRisk(Number(signal.entry), Number(signal.stop_loss), signal.take_profits);
    if (Number(s.min_rr) > 0 && (rr == null || rr < Number(s.min_rr))) return { ok: false, skipped: 'rr' };
    // Size by the channel's track record: proven groups get bigger lots, new or shaky ones smaller.
    // Dropped groups keep trading at the minimum so they are still measured and can earn their way back.
    const { mult, confidence } = await channelSizing(userId, signal.source);
    // News guard: quarter lot right around a high-impact release, half lot in the hour before (lib/news-guard.js).
    const news = await newsCheck(signal.symbol).catch(() => ({ level: 'clear', mult: 1 }));
    const equity = await getEquity(userId, s);
    const riskUsdt = Math.round(riskAmount(s, equity) * mult * news.mult * 100) / 100;
    // Main book: every signal, never skipped, so every channel keeps being measured.
    const r = await openPaperTrade({ userId, signal, riskUsdt, auto: true });
    // Growth book: the same signal again on the small account, only if its balance and stage support it.
    const g = await growthEnter(userId, s, signal, { mult, confidence, news }).catch((e) => ({ ok: false, error: e.message }));
    if (r.ok) {
      const msg = describeEntry(r.trade);
      msg.body += ` · lot ×${mult} (${confidence}% confident in ${signal.source})`;
      if (news.level !== 'clear') msg.body += ` · 📰 ${news.level === 'danger' ? 'quarter' : 'half'} lot: ${await newsReason(news, signal.symbol)}`;
      if (g) msg.body += g.ok ? ` · 🌱 growth account took it: ${g.trade.qty} ${base(signal.symbol)}, risk $${Number(g.trade.actual_risk_usdt).toFixed(2)} of $${g.equity.toFixed(2)}` : ` · 🌱 growth account skipped: ${g.skipped || g.error}`;
      await notify(msg, `trade-${r.trade.id}-new`);
    }
    return r;
  } catch {
    return null;
  }
}

// Growth challenge (broker_settings.growth): the stage for the growth balance sets risk %, the ceiling for the
// smallest lot and which channels it follows. Returns null when the challenge is off.
async function growthEnter(userId, s, signal, { mult, confidence, news }) {
  const g = s.broker_settings?.growth;
  if (!g?.on) return null;
  const st = await growthState(userId, g);
  const tier = growthTier(st.equity, s.risk_pct);
  if (confidence < tier.minConf) return { ok: false, skipped: `${tier.label} stage follows channels ${tier.minConf}%+ confident, ${signal.source} is ${confidence}%` };
  const riskUsdt = Math.round(((st.equity * tier.pct) / 100) * mult * news.mult * 100) / 100;
  const r = await openPaperTrade({ userId, signal, riskUsdt, auto: true, growth: { equity: st.equity, free: st.free, cap: (st.equity * tier.cap) / 100 } });
  return { ...r, equity: st.equity, skipped: r.ok ? undefined : r.error };
}

export async function candlesSince(symbol, startMs) {
  return klines(symbol, { interval: replayInterval(Date.now() - startMs), startTime: startMs, limit: 1000 });
}

export async function evaluateLiveTrade(trade, profiles = {}) {
  const candles = await candlesSince(trade.symbol, new Date(trade.created_at).getTime());
  if (!candles) return null;
  // Trades opened before smart trailing get their channel's style and the ATR at their entry now.
  const extra = {};
  if (trade.source !== 'Manual' && trade.stop_loss != null) {
    if (!trade.trail_mode) extra.trail_mode = profiles[trade.source]?.mode || TRAIL_DEFAULT;
    if (trade.trail_atr == null) extra.trail_atr = await atrBefore(trade.symbol, new Date(trade.created_at).getTime());
  }
  return { ...extra, ...evaluateTrade({ ...trade, ...extra }, candles) };
}

// A manual order from the order form, like Binance Spot: MARKET fills now at the ask (buy) or bid (sell);
// LIMIT fills now if it crosses the book, otherwise it rests until price trades through it.
// SELL without holding the coin is a simulated short (Spot cannot really do that).
export async function openManualOrder({ userId, symbol, side, type, qty, quoteQty, price, stopLoss, takeProfits }) {
  if (!/^[A-Z0-9]{3,20}$/.test(symbol || '')) return { ok: false, error: 'Pick a trading pair.' };
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
  // MT5 markets are CFDs: they tie up margin (1:100, like a typical broker account), in dollars; crypto ties up the full cost.
  const conv = await quoteToUsd(symbol, entry);
  if (!(conv > 0)) return { ok: false, error: `Could not convert ${symbol} to US dollars right now.` };
  const cost = isMt5(symbol) ? (q * entry * conv) / MT5_LEVERAGE : q * entry * (1 + FEE_RATE);
  if (cost > acct.available + 1e-6) return { ok: false, error: `Insufficient balance: needs $${cost.toFixed(2)}${isMt5(symbol) ? ' margin' : ''}, $${acct.available.toFixed(2)} available.` };

  const sl = Number(stopLoss) > 0 ? roundToTick(Number(stopLoss), filters.tickSize) : null;
  const tps = (Array.isArray(takeProfits) ? takeProfits : [takeProfits]).map(Number).filter((v) => v > 0).map((v) => roundToTick(v, filters.tickSize));
  tps.sort((a, b) => (buy ? a - b : b - a));
  if (!levelsValid(side, entry, tps, sl)) return { ok: false, error: `For a ${buy ? 'buy' : 'sell'}, take-profit must be ${buy ? 'above' : 'below'} and stop-loss ${buy ? 'below' : 'above'} the entry (${entry}).` };

  const spread = book.ask - book.bid;
  const risk = sl != null ? (Math.abs(entry - sl) + spread) * q * conv : 0;
  const row = {
    user_id: userId, signal_id: null, source: 'Manual', symbol, side, mode: 'paper', auto: false,
    entry, stop_loss: sl, take_profits: tps, qty: q, notional: q * entry * conv, quote_usd: conv,
    risk_usdt: risk || q * entry, actual_risk_usdt: risk || null, min_forced: false,
    spread_abs: spread, spread_pct: (spread / ((book.ask + book.bid) / 2)) * 100, equity_at_entry: acct.equity,
    status, filled_at: status === 'open' ? new Date().toISOString() : null
  };
  let { data, error } = await supabaseAdmin.from('paper_trades').insert(row).select().single();
  if (missingColumn(error)) {
    if (conv !== 1) return { ok: false, error: `Run supabase-migration-quote-usd.sql to paper-trade ${symbol}.` };
    ({ data, error } = await supabaseAdmin.from('paper_trades').insert(withoutQuoteUsd(row)).select().single());
  }
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
  let { data, error } = await supabaseAdmin.from('paper_trades').update(patch).eq('id', id).eq('user_id', userId).select().single();
  if (missingColumn(error)) ({ data, error } = await supabaseAdmin.from('paper_trades').update(withoutTrail(patch)).eq('id', id).eq('user_id', userId).select().single());
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
    const why = now.status === 'lost' && now.tp_hit === 0 ? 'Stop-loss hit' : now.tp_hit === n && n ? `All ${n} targets hit` : now.tp_hit ? `Trailing stop hit after TP${now.tp_hit}` : 'Closed';
    return { title: `${icon} ${name} closed ${usd(Number(now.pnl_usdt))}`, body: `${why}. Exit ${fmt(now.last_price)}.` };
  }
  if (old.status === 'pending' && now.status === 'open') {
    return { title: `📥 ${name} filled at ${fmt(old.entry)}`, body: `${old.qty} ${base(old.symbol)} · TP ${(old.take_profits || []).map(fmt).join(' / ') || '—'} · SL ${old.stop_loss != null ? fmt(old.stop_loss) : '—'}` };
  }
  if ((now.tp_hit || 0) > (old.tp_hit || 0) && now.status === 'open') {
    const k = now.tp_hit;
    const banked = partialRealized({ ...old, tp_hit: k });
    const style = TRAIL_LABEL[now.trail_mode || old.trail_mode] || '';
    const moved = now.trail_stop != null && Number(now.trail_stop) !== Number(old.stop_loss) ? ` Trailing SL now ${fmt(now.trail_stop)}${style ? ` (${style})` : ''}.` : '';
    return { title: `🎯 ${name} TP${k} hit at ${fmt(old.take_profits[k - 1])}`, body: `${k}/${n} targets done, ${usd(banked)} banked so far.${moved}${k < n ? ` Next TP${k + 1} ${fmt(old.take_profits[k])}.` : ''}` };
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
  const live = trades.filter((t) => t.status === 'pending' || t.status === 'open').slice(0, 60);
  const profiles = await trailProfiles(userId).catch(() => ({}));
  const results = await Promise.allSettled(live.map((t) => evaluateLiveTrade(t, profiles)));
  const save = async (q, patch) => {
    let r = await q(patch);
    if (missingColumn(r.error)) r = await q(withoutTrail(patch));
    return r;
  };
  const byId = {};
  await Promise.all(results.map(async (r, i) => {
    const patch = r.status === 'fulfilled' ? r.value : null;
    if (!patch) return;
    const old = live[i];
    byId[old.id] = patch;
    const msg = isMain(old) ? describeChange(old, patch) : null; // the growth book reports through its milestones
    if (!msg) { await save((p) => supabaseAdmin.from('paper_trades').update(p).eq('id', old.id).eq('user_id', userId), patch); return; }
    const { data } = await save((p) => supabaseAdmin.from('paper_trades').update(p).eq('id', old.id).eq('user_id', userId).eq('status', old.status).eq('tp_hit', old.tp_hit || 0).select('id'), patch);
    if (data && data.length) await notify(msg, `trade-${old.id}-${patch.status}-${patch.tp_hit}`);
  }));
  return trades.map((t) => (byId[t.id] ? { ...t, ...byId[t.id] } : t));
}
