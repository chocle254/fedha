// lib/market-context.js — what the market is doing at the moment a signal arrives, measured from real candles (never
// guessed by the AI): the session and ICT killzone, the 15-minute and 1-hour trend, where price sits in the last 24
// hours (premium / discount), whether it just swept liquidity (yesterday's or the Asia session's high or low and
// closed back inside), the latest fair value gap, momentum (RSI), how far it moves in an hour (ATR) and news ahead.
// The coach (lib/desk-coach.js) reads it, the Desk's "market" rule learns from it, and it is saved on the signal.
import { klines } from './market';
import { newsCheck } from './news-guard';

const HOUR = 3600e3;
const round = (v, d = 2) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
function emaLast(values, n) { const k = 2 / (n + 1); let e = values[0]; for (const x of values) e = x * k + e * (1 - k); return e; }
function rsi(closes, n = 14) {
  const c = closes.slice(-(n + 1)); let up = 0; let down = 0;
  for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1]; if (d > 0) up += d; else down -= d; }
  return down === 0 ? 100 : Math.round(100 - 100 / (1 + up / down));
}
function atr(c, n = 14) {
  const tr = []; for (let i = 1; i < c.length; i++) tr.push(Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c)));
  const t = tr.slice(-n); return t.length ? t.reduce((a, b) => a + b, 0) / t.length : null;
}

// Sessions in UTC (ICT): Asia 00-07, London 07-12, New York 12-17, late New York 17-21, off hours 21-24.
// Killzones: London 07-10 UTC (10:00-13:00 Kenya), New York 12-15 UTC (15:00-18:00 Kenya).
export function sessionAt(ms) {
  const h = new Date(ms).getUTCHours();
  const session = h < 7 ? 'Asia' : h < 12 ? 'London' : h < 17 ? 'New York' : h < 21 ? 'Late New York' : 'Off hours';
  const killzone = h >= 7 && h < 10 ? 'London killzone' : h >= 12 && h < 15 ? 'New York killzone' : null;
  return { session, killzone };
}

// Side-relative: is this trade buying cheap / selling dear (good), or the opposite (bad)?
export const zoneFor = (side, zone) => (zone === 'mid' || !zone ? 'mid' : (side === 'BUY') === (zone === 'discount') ? 'good' : 'bad');

export async function contextAt(symbol, side, at = Date.now()) {
  const [h1, m15] = await Promise.all([
    klines(symbol, { interval: '1h', endTime: at, limit: 72, at }),
    klines(symbol, { interval: '15m', endTime: at, limit: 96, at }),
  ]);
  if (!h1 || h1.length < 30 || !m15 || m15.length < 30) return null;
  const c1 = h1.filter((k) => k.t + HOUR <= at + 60e3); const c15 = m15.filter((k) => k.t + 15 * 60e3 <= at + 60e3);
  if (c1.length < 25 || c15.length < 25) return null;
  const price = c15[c15.length - 1].c;
  const t15 = emaLast(c15.map((k) => k.c), 8) > emaLast(c15.map((k) => k.c), 21) ? 'up' : 'down';
  const t1h = emaLast(c1.map((k) => k.c), 8) > emaLast(c1.map((k) => k.c), 21) ? 'up' : 'down';
  const last24 = c1.slice(-24);
  const hi = Math.max(...last24.map((k) => k.h)); const lo = Math.min(...last24.map((k) => k.l));
  const pos = hi > lo ? (price - lo) / (hi - lo) : 0.5;
  const zone = pos > 0.6 ? 'premium' : pos < 0.4 ? 'discount' : 'mid';
  // Yesterday (UTC day) and today's Asia session: the liquidity pools ICT traders watch.
  const day = (ms) => new Date(ms).toISOString().slice(0, 10);
  const today = day(at); const yest = day(at - 24 * HOUR);
  const y = c1.filter((k) => day(k.t) === yest); const asia = c1.filter((k) => day(k.t) === today && new Date(k.t).getUTCHours() < 7);
  const pdh = y.length ? Math.max(...y.map((k) => k.h)) : null; const pdl = y.length ? Math.min(...y.map((k) => k.l)) : null;
  const ah = asia.length >= 3 ? Math.max(...asia.map((k) => k.h)) : null; const al = asia.length >= 3 ? Math.min(...asia.map((k) => k.l)) : null;
  // Sweep: in the last 2 hours price traded past a pool and the latest candle closed back inside.
  const recent = c15.slice(-8);
  const lows = [pdl, al].filter((v) => v != null); const highs = [pdh, ah].filter((v) => v != null);
  const sweptLow = lows.find((lv) => recent.some((k) => k.l < lv) && price > lv);
  const sweptHigh = highs.find((lv) => recent.some((k) => k.h > lv) && price < lv);
  const sweep = sweptLow != null && sweptHigh == null ? 'swept lows' : sweptHigh != null && sweptLow == null ? 'swept highs' : null;
  // Latest fair value gap on 15 minutes (a 3-candle gap) in the last 3 hours, and whether price still respects it.
  let fvg = null;
  for (let i = c15.length - 1; i >= Math.max(2, c15.length - 12); i--) {
    const a = c15[i - 2]; const c = c15[i];
    if (c.l > a.h && price >= a.h) { fvg = 'bullish'; break; }
    if (c.h < a.l && price <= a.l) { fvg = 'bearish'; break; }
  }
  const news = await newsCheck(symbol, at).catch(() => ({ level: 'clear' }));
  const { session, killzone } = sessionAt(at);
  const buy = side === 'BUY';
  const with1h = (t1h === 'up') === buy; const with15 = (t15 === 'up') === buy;
  return {
    price: round(price), session, killzone,
    t15, t1h, trend: with1h && with15 ? 'with' : !with1h && !with15 ? 'against' : 'mixed',
    zone, rangePos: round(pos * 100, 0), sideZone: zoneFor(side, zone), dayHigh: round(hi), dayLow: round(lo),
    pdh: round(pdh), pdl: round(pdl), asiaHigh: round(ah), asiaLow: round(al),
    sweep, sweepFor: sweep ? ((sweep === 'swept lows') === buy ? 'with' : 'against') : null,
    fvg, fvgFor: fvg ? ((fvg === 'bullish') === buy ? 'with' : 'against') : null,
    rsi1h: rsi(c1.map((k) => k.c)), atr1h: round(atr(c1)), news: news?.level || 'clear',
  };
}

// Small copy saved on the signal (trade_signals.desk.x).
export const contextStamp = (c) => (c ? { s: c.session, k: c.killzone, t: c.trend, z: c.sideZone, w: c.sweepFor, f: c.fvgFor, r: c.rsi1h, n: c.news } : null);
