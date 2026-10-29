// Market data for paper trading and tracking (server side).
// Crypto comes from Binance Spot. Gold comes from Binance XAUT, which tracks spot gold (what signal channels and
// brokers quote) within about $1, so channel levels are used as written. Other MT5 markets come from
// Yahoo Finance's free feed: futures for metals/energy/indices (they move with the broker's CFD price, a little
// offset), spot for forex. Signals are shifted onto this price at entry (see rebaseToMarket), so the distances to
// TP and SL stay the signal's own.
import { instrument, isMt5 } from './instruments';

const BINANCE = 'https://api.binance.com/api/v3';
const yahooUrl = (symbol) => `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(instrument(symbol).yahoo)}`;

export { isMt5 };

// The Binance spot-tracking token for this market, for something created at `at` (ms), or null for Yahoo.
export function spotToken(symbol, at = Date.now()) {
  const i = instrument(symbol);
  if (!i?.binance) return null;
  return !i.since || at >= Date.parse(i.since) ? i.binance : null;
}
async function binanceCandles(sym, { interval, startTime, endTime, limit }) {
  const q = `symbol=${sym}&interval=${interval}&limit=${Math.min(limit, 1000)}${startTime ? `&startTime=${Math.floor(startTime)}` : ''}${endTime ? `&endTime=${Math.floor(endTime)}` : ''}`;
  const r = await fetch(`${BINANCE}/klines?${q}`, { cache: 'no-store' });
  if (!r.ok) return null;
  return (await r.json()).map((c) => ({ t: c[0], o: Number(c[1]), h: Number(c[2]), l: Number(c[3]), c: Number(c[4]), v: Number(c[5]) }));
}

const MS = { '1m': 60e3, '3m': 180e3, '5m': 300e3, '15m': 900e3, '30m': 1800e3, '1h': 3600e3, '2h': 7200e3, '4h': 14400e3, '1d': 86400e3, '1w': 604800e3 };
// Yahoo's nearest interval; 2h and 4h are built from 1h candles. (Yahoo keeps 1m for 7 days, 5m–30m for 60.)
const YAHOO_INTERVAL = { '1m': '1m', '3m': '2m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '60m', '2h': '60m', '4h': '60m', '1d': '1d', '1w': '1wk' };

async function yahoo(symbol, params) {
  const r = await fetch(`${yahooUrl(symbol)}?${params}`, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store', signal: AbortSignal.timeout(12000) });
  if (!r.ok) return null;
  return (await r.json())?.chart?.result?.[0] || null;
}

function merge(candles, ms) {
  const out = [];
  for (const k of candles) {
    const t = Math.floor(k.t / ms) * ms;
    const last = out[out.length - 1];
    if (last && last.t === t) { last.h = Math.max(last.h, k.h); last.l = Math.min(last.l, k.l); last.c = k.c; last.v += k.v; }
    else out.push({ ...k, t });
  }
  return out;
}

async function yahooCandles(symbol, { interval = '15m', startTime, endTime, limit = 500 }) {
  const ms = MS[interval] || MS['15m'];
  const now = Date.now();
  // Markets close at night and at weekends, so ask for a wider window than `limit` candles and trim.
  let from;
  let to;
  if (startTime) { from = startTime; to = Math.min(now, startTime + limit * ms); }
  else { to = endTime || now; from = to - limit * ms * 3 - 3 * 86400e3; }
  const res = await yahoo(symbol, `interval=${YAHOO_INTERVAL[interval] || '15m'}&period1=${Math.floor(from / 1000)}&period2=${Math.ceil(to / 1000)}`);
  if (!res || !res.timestamp) return res ? [] : null;
  const q = res.indicators?.quote?.[0] || {};
  let candles = [];
  for (let i = 0; i < res.timestamp.length; i++) {
    if (q.high?.[i] == null || q.low?.[i] == null || q.close?.[i] == null) continue;
    candles.push({ t: res.timestamp[i] * 1000, o: q.open?.[i] ?? q.close[i], h: q.high[i], l: q.low[i], c: q.close[i], v: q.volume?.[i] || 0 });
  }
  if (interval === '2h' || interval === '4h') candles = merge(candles, ms);
  if (startTime) candles = candles.filter((k) => k.t + ms > startTime);
  if (endTime) candles = candles.filter((k) => k.t < endTime);
  return startTime ? candles.slice(0, limit) : candles.slice(-limit);
}

// Candles as [{ t, o, h, l, c, v }], oldest first. null when the source could not be reached.
// `at` = when the trade or signal was created (defaults to startTime, else now): it picks the feed its levels use.
export async function klines(symbol, { interval = '15m', startTime, endTime, limit = 500, at } = {}) {
  try {
    if (isMt5(symbol)) {
      const tok = spotToken(symbol, at ?? startTime ?? Date.now());
      if (tok) return await binanceCandles(tok, { interval, startTime, endTime, limit });
      return await yahooCandles(symbol, { interval, startTime, endTime, limit });
    }
    return await binanceCandles(symbol, { interval, startTime, endTime, limit });
  } catch {
    return null;
  }
}

export async function lastPrice(symbol) {
  try {
    const tok = spotToken(symbol);
    if (tok) symbol = tok;
    else if (isMt5(symbol)) {
      const res = await yahoo(symbol, 'interval=1m&range=1d');
      const p = Number(res?.meta?.regularMarketPrice);
      return p > 0 ? p : null;
    }
    const r = await fetch(`${BINANCE}/ticker/price?symbol=${symbol}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const p = Number((await r.json()).price);
    return p > 0 ? p : null;
  } catch {
    return null;
  }
}

// Best bid and ask. MT5 markets have no public order book here, so it is the price ± half a typical spread.
export async function bookTicker(symbol) {
  if (isMt5(symbol)) { // the broker's spread around the price (the token's own book is not the broker's)
    const p = await lastPrice(symbol);
    const half = instrument(symbol).spread / 2;
    return p ? { bid: p - half, ask: p + half } : null;
  }
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

// Size rules for MT5 paper positions: quantity in units (oz, currency units, barrels, contracts).
export function mt5Filters(symbol) {
  const i = instrument(symbol);
  return { minQty: i.step, stepSize: i.step, minNotional: 0, tickSize: Math.min(0.01, i.pip / 10), base: i.base || symbol.slice(0, 3), quote: i.quote ?? symbol.slice(3) };
}

// 24h-style quote for the trading page: { symbol, price, open, high, low, change, spreadPct }.
export async function mt5Quote(symbol) {
  const tok = spotToken(symbol);
  if (tok) {
    const r = await fetch(`${BINANCE}/ticker/24hr?symbol=${tok}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const t = await r.json();
    const price = Number(t.lastPrice);
    if (!(price > 0)) return null;
    return { symbol, price, open: Number(t.openPrice) || price, high: Number(t.highPrice) || price, low: Number(t.lowPrice) || price, change: Number(t.priceChangePercent) || 0, spreadPct: (instrument(symbol).spread / price) * 100 };
  }
  const res = await yahoo(symbol, 'interval=5m&range=1d');
  const price = Number(res?.meta?.regularMarketPrice);
  if (!(price > 0)) return null;
  const open = Number(res.meta.chartPreviousClose) || price;
  return { symbol, price, open, high: Number(res.meta.regularMarketDayHigh) || price, low: Number(res.meta.regularMarketDayLow) || price, change: ((price - open) / open) * 100, spreadPct: (instrument(symbol).spread / price) * 100 };
}
