// lib/coach-sniper.js — the Coach's own trades on gold: a classic ICT sniper entry, found in code and confirmed by him.
//
//  When   Only inside the London (07-10 UTC, 10:00-13:00 Kenya) and New York (12-15 UTC, 15:00-18:00 Kenya)
//         killzones, Monday to Friday, at most one per killzone per side.
//  Setup  Price swept a liquidity pool (yesterday's or the Asia session's low for a buy, high for a sell) in the last
//         2 hours and closed back inside, AND the 15-minute picture turned his way (a fair value gap behind the move
//         or the 15m trend flipping), AND no high-impact news in the next hour.
//  Levels Entry at the market. Stop just beyond the sweep's extreme (plus 0.2 x the 1-hour ATR), kept between 0.3x
//         and 1.5x ATR. TP1 at 2R; TP2 at the opposite pool if it is further, else 3R.
//  Call   The Coach sees the setup, the market read and the news desk, and takes it only at conviction 3/5 or more.
// Trades go on his own paper account ("Coach's own trades", book coach_own) and never into the main account or the
// channel records. Each one sends a push with entry, stop, targets and why.
import { contextAt } from './market-context';
import { klines } from './market';
import { aiJSON } from './ai-json';
import { supabaseAdmin } from './supabaseAdmin';
import { impactsFor } from './news-read';

const SYMBOL = 'XAUUSD';
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const r2 = (v) => Math.round(v * 100) / 100;

function killzone(ms) {
  const d = new Date(ms); const h = d.getUTCHours(); const wd = d.getUTCDay();
  if (wd === 0 || wd === 6) return null;
  return h >= 7 && h < 10 ? 'london' : h >= 12 && h < 15 ? 'ny' : null;
}

// The setup, or null. Pure code: no AI here.
export async function findSetup(at = Date.now()) {
  const kz = killzone(at);
  if (!kz) return null;
  const m15 = await klines(SYMBOL, { interval: '15m', endTime: at, limit: 40, at });
  if (!m15 || m15.length < 20) return null;
  for (const side of ['BUY', 'SELL']) {
    const c = await contextAt(SYMBOL, side, at);
    if (!c || c.news === 'danger' || c.news === 'caution') continue;
    if (c.sweepFor !== 'with') continue;
    const turned = c.fvgFor === 'with' || (side === 'BUY' ? c.t15 === 'up' : c.t15 === 'down');
    if (!turned) continue;
    const recent = m15.slice(-8);
    const atr = c.atr1h || 0;
    if (!(atr > 0)) continue;
    const buy = side === 'BUY';
    const extreme = buy ? Math.min(...recent.map((k) => k.l)) : Math.max(...recent.map((k) => k.h));
    let dist = Math.abs(c.price - extreme) + 0.2 * atr;
    dist = Math.max(0.3 * atr, Math.min(1.5 * atr, dist));
    const entry = c.price;
    const stop = buy ? entry - dist : entry + dist;
    const tp1 = buy ? entry + 2 * dist : entry - 2 * dist;
    const pool = buy ? Math.max(c.asiaHigh || 0, c.pdh || 0) : Math.min(...[c.asiaLow, c.pdl].filter((v) => v != null));
    const tp2 = Number.isFinite(pool) && (buy ? pool > tp1 : pool < tp1) ? pool : buy ? entry + 3 * dist : entry - 3 * dist;
    return { side, kz, entry: r2(entry), stop: r2(stop), tps: [r2(tp1), r2(tp2)], risk: r2(dist), ctx: c };
  }
  return null;
}

const PERSONA = 'You are a senior prop-desk trader (20 years on gold, ICT: liquidity sweeps, killzones, fair value gaps, premium/discount, market structure, the news). You are deciding whether to take your OWN sniper entry. Be strict: most setups are skipped. Use only the facts given.';

// Called from the trading tick (lib/desk-daily.js deskTick). Places at most one trade per killzone per side.
export async function sniperScan(userId, { news = null, state = {}, saveDesk, openPaperTrade, sideBookState, books, notify } = {}) {
  const at = Date.now();
  const kz = killzone(at);
  if (!kz) return null;
  const day = new Date(at).toISOString().slice(0, 10);
  const done = state.sniper || {};
  if (done[`${day}-${kz}-BUY`] && done[`${day}-${kz}-SELL`]) return null;
  const setup = await findSetup(at);
  if (!setup) return null;
  const key = `${day}-${kz}-${setup.side}`;
  if (done[key]) return null;
  await saveDesk(userId, { sniper: { ...Object.fromEntries(Object.entries(done).filter(([k]) => k.startsWith(day))), [key]: 'seen' } });

  const facts = { setup: { side: setup.side, killzone: kz === 'ny' ? 'New York' : 'London', entry: setup.entry, stop: setup.stop, targets: setup.tps, riskPerUnit: setup.risk }, market: setup.ctx, news: impactsFor(news, SYMBOL), newsMood: news?.summary || null };
  const o = await aiJSON(`${PERSONA}

Your scanner found this gold setup: price swept liquidity and turned your way inside the killzone.
FACTS: ${JSON.stringify(facts)}
Return JSON: {"take":true|false,"conviction":1-5,"why":"2-3 sentences naming the facts (sweep, FVG, trend, zone, killzone, news) that decide it"}`, { maxTokens: 400, temperature: 0.2, timeout: 15000 }).catch(() => null);
  if (!o) return null;
  const conviction = Math.max(1, Math.min(5, Math.round(Number(o.conviction) || 1)));
  const why = clip(o.why, 360);
  if (!o.take || conviction < 3) {
    await saveDesk(userId, { sniper: { ...Object.fromEntries(Object.entries(done).filter(([k]) => k.startsWith(day))), [key]: `passed ${conviction}/5` }, sniper_last: { at: new Date(at).toISOString(), side: setup.side, kz, taken: false, conviction, why } });
    return { taken: false, conviction, why };
  }

  // Record it as a signal from the Coach (so it is tracked and shown like any other), then trade it on his own book.
  const { data: signal, error } = await supabaseAdmin.from('trade_signals').insert({
    user_id: userId, source: 'Coach · sniper', symbol: SYMBOL, side: setup.side,
    raw_text: `Coach sniper ${setup.side} XAUUSD @ ${setup.entry} SL ${setup.stop} TP1 ${setup.tps[0]} TP2 ${setup.tps[1]} (${kz} killzone). ${why}`.slice(0, 2000),
    external_id: `coach-${key}`, entry: setup.entry, entry_low: setup.entry, entry_high: setup.entry, take_profits: setup.tps, stop_loss: setup.stop,
    market_price: setup.entry, status: 'open', filled_at: new Date(at).toISOString(), note: `Coach's own setup, conviction ${conviction}/5: ${why}`.slice(0, 500),
  }).select().single();
  if (error || !signal) return null;
  const st = await sideBookState(userId, 'coach_own', books.coach_own.since);
  const pct = conviction >= 5 ? 15 : conviction === 4 ? 12 : 10; // bigger when he is surer, never over 15%
  const room = Math.max(0, st.equity - st.openRisk);
  const cap = Math.min((st.equity * 15) / 100, room);
  const riskUsdt = r2(Math.min((st.equity * pct) / 100, cap));
  const t = riskUsdt >= 0.01 ? await openPaperTrade({ userId, signal, riskUsdt, auto: true, growth: { equity: st.equity, free: st.free, cap: cap * 1.0001 }, bookName: 'coach_own' }) : { ok: false, error: 'no room' };
  await saveDesk(userId, { sniper: { ...Object.fromEntries(Object.entries(done).filter(([k]) => k.startsWith(day))), [key]: t.ok ? 'taken' : 'failed' }, sniper_last: { at: new Date(at).toISOString(), side: setup.side, kz, taken: t.ok, conviction, why, entry: setup.entry, stop: setup.stop, tps: setup.tps } });
  if (t.ok) await notify({ title: `🎯 Coach sniper: ${setup.side} gold ${setup.entry}`, body: `SL ${setup.stop} · TP1 ${setup.tps[0]} · TP2 ${setup.tps[1]} · ${conviction}/5 · ${why}`, url: '/trading' }, `sniper-${key}`).catch(() => null);
  return { taken: t.ok, conviction, why, setup };
}
