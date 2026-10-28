// Market data for paper trading and tracking (server side).
// Crypto comes from Binance Spot. Gold (XAUUSD) comes from COMEX gold futures via Yahoo Finance (GC=F):
// free 1-minute candles that move with spot gold almost tick for tick, a few dollars above it. Gold signals
// are shifted onto this price at entry (see rebaseToMarket), so the distances to TP and SL stay the signal's own.
const BINANCE = 'https://api.binance.com/api/v3';
const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF';

export const GOLD = 'XAUUSD';
export const GOLD_SPREAD = 0.3; // typical broker spread on XAUUSD, in dollars (gold CFDs charge spread, not a fee)
export const isGold = (symbol) => String(symbol || '').toUpperCase() === GOLD;

const MS = { '1m': 60e3, '3m': 180e3, '5m': 300e3, '15m': 900e3, '30m': 1800e3, '1h': 3600e3, '2h': 7200e3, '4h': 14400e3, '1d': 86400e3, '1w': 604800e3 };
// Yahoo's nearest interval; 2h and 4h are built from 1h candles. (Yahoo keeps 1m for 7 days, 5m–30m for 60.)
const YAHOO_INTERVAL = { '1m': '1m', '3m': '2m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '60m', '2h': '60m', '4h': '60m', '1d': '1d', '1w': '1wk' };

async function yahoo(params) {
  const r = await fetch(`${YAHOO}?${params}`, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store', signal: AbortSignal.timeout(12000) });
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

async function goldCandles({ interval = '15m', startTime, endTime, limit = 500 }) {
  const ms = MS[interval] || MS['15m'];
  const now = Date.now();
  // Markets close at night and at weekends, so ask for a wider window than `limit` candles and trim.
  let from;
  let to;
  if (startTime) { from = startTime; to = Math.min(now, startTime + limit * ms); }
  else { to = endTime || now; from = to - limit * ms * 3 - 3 * 86400e3; }
  const res = await yahoo(`interval=${YAHOO_INTERVAL[interval] || '15m'}&period1=${Math.floor(from / 1000)}&period2=${Math.ceil(to / 1000)}`);
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
export async function klines(symbol, { interval = '15m', startTime, endTime, limit = 500 } = {}) {
  try {
    if (isGold(symbol)) return await goldCandles({ interval, startTime, endTime, limit });
    const q = `symbol=${symbol}&interval=${interval}&limit=${limit}${startTime ? `&startTime=${Math.floor(startTime)}` : ''}${endTime ? `&endTime=${Math.floor(endTime)}` : ''}`;
    const r = await fetch(`${BINANCE}/klines?${q}`, { cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.json()).map((c) => ({ t: c[0], o: Number(c[1]), h: Number(c[2]), l: Number(c[3]), c: Number(c[4]), v: Number(c[5]) }));
  } catch {
    return null;
  }
}

export async function lastPrice(symbol) {
  try {
    if (isGold(symbol)) {
      const res = await yahoo('interval=1m&range=1d');
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

// Best bid and ask. Gold has no public order book, so it is the price ± half a typical broker spread.
export async function bookTicker(symbol) {
  if (isGold(symbol)) {
    const p = await lastPrice(symbol);
    return p ? { bid: p - GOLD_SPREAD / 2, ask: p + GOLD_SPREAD / 2 } : null;
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

// Size rules for gold paper trades: quantity in ounces, 0.01 oz steps (a 0.01 broker lot is 1 oz).
export const GOLD_FILTERS = { minQty: 0.01, stepSize: 0.01, minNotional: 0, tickSize: 0.01, base: 'XAU', quote: 'USD' };

// 24h-style quote for the trading page: { symbol, price, open, high, low, change }.
export async function goldQuote() {
  const res = await yahoo('interval=5m&range=1d');
  const price = Number(res?.meta?.regularMarketPrice);
  if (!(price > 0)) return null;
  const open = Number(res.meta.chartPreviousClose) || price;
  return { symbol: GOLD, price, open, high: Number(res.meta.regularMarketDayHigh) || price, low: Number(res.meta.regularMarketDayLow) || price, change: ((price - open) / open) * 100, spreadPct: (GOLD_SPREAD / price) * 100 };
}
