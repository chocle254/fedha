// lib/desk-daily.js — the Desk's two regular jobs, run from the trading tick:
//
//  Market read (hourly)   Gold measured from real candles: trend on 15 minutes, 1 hour and the slower drift,
//                         how far it moves in an hour (ATR), momentum (RSI), today's and yesterday's highs and
//                         lows, the session, and high-impact news ahead. The numbers are worked out in code; the
//                         AI only puts them into plain English. It describes the market, it does not predict it.
//
//  Daily review (21:00)   What the day's closed signals did: by channel, by time of day, what the Desk's picks
//                         did against the rest, and one change worth making. Kept for 7 days, with one push.
//
// Both live in trade_settings.desk (small: one market read, seven reviews).
import { klines } from './market';
import { atrOf } from './trading-core';
import { upcomingNews } from './news-guard';
import { notify } from './trading';
import { aiJSON } from './ai-json';
import { supabaseAdmin } from './supabaseAdmin';
import { deskHistory, deskState, saveDesk, windowOf, WINDOW_LABEL, learnRule, ruleOf, RULES } from './desk';
import { readNews } from './news-read';
import { sniperScan } from './coach-sniper';
import { openPaperTrade, sideBookState, sideBooks } from './trading';

const SYMBOL = 'XAUUSD';
const HOUR = 3600e3;
const MARKET_EVERY = 60 * 60e3;
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const nairobiDay = (ms) => new Date(ms + 3 * HOUR).toISOString().slice(0, 10);
const rTxt = (r) => `${r >= 0 ? '+' : ''}${Number(r).toFixed(2)}R`;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

function emaLast(values, n, back = 0) {
  const v = back ? values.slice(0, values.length - back) : values;
  const k = 2 / (n + 1); let e = v[0];
  for (const x of v) e = x * k + e * (1 - k);
  return e;
}
function rsi(closes, n = 14) {
  const c = closes.slice(-(n + 1));
  let up = 0; let down = 0;
  for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1]; if (d > 0) up += d; else down -= d; }
  return down === 0 ? 100 : Math.round(100 - 100 / (1 + up / down));
}
function sessionOf(ms) {
  const h = new Date(ms).getUTCHours();
  return h < 7 ? 'Asia (usually quiet for gold)' : h < 12 ? 'London' : h < 16 ? 'London and New York together (the busiest hours)' : h < 21 ? 'New York' : 'After hours (thin)';
}

// The measured facts, or null if prices could not be loaded.
export async function marketFacts(now = Date.now()) {
  const [h1, m15] = await Promise.all([klines(SYMBOL, { interval: '1h', limit: 200 }), klines(SYMBOL, { interval: '15m', limit: 120 })]);
  if (!h1 || h1.length < 60 || !m15 || m15.length < 30) return null;
  const c1 = h1.map((k) => k.c); const c15 = m15.map((k) => k.c);
  const price = c15[c15.length - 1];
  const up15 = emaLast(c15, 8) > emaLast(c15, 21);
  const up1h = emaLast(c1, 20) > emaLast(c1, 50);
  const drift = emaLast(c1, 50) - emaLast(c1, 50, 12); // is the slow average itself rising or falling over 12 hours
  const upSlow = drift > 0;
  const atr = atrOf(h1, 14);
  const today = nairobiDay(now); const yesterday = nairobiDay(now - 24 * HOUR);
  const day = (d) => h1.filter((k) => nairobiDay(k.t) === d);
  const hi = (a) => (a.length ? Math.max(...a.map((k) => k.h)) : null);
  const lo = (a) => (a.length ? Math.min(...a.map((k) => k.l)) : null);
  const t = day(today); const y = day(yesterday);
  const agree = [up15, up1h, upSlow].filter(Boolean).length;
  const news = (await upcomingNews([SYMBOL], 12, now).catch(() => [])).slice(0, 3).map((e) => ({ title: clip(e.title, 60), currency: e.currency, minutes: Math.round((e.at - now) / 60e3) }));
  return {
    at: new Date(now).toISOString(), price: round(price),
    bias: agree === 3 ? 'up' : agree === 0 ? 'down' : 'mixed',
    m15: up15 ? 'up' : 'down', h1: up1h ? 'up' : 'down', slow: upSlow ? 'up' : 'down',
    atr: atr ? round(atr) : null, rsi: rsi(c1),
    dayHigh: hi(t), dayLow: lo(t), yHigh: hi(y), yLow: lo(y),
    weekHigh: hi(h1.slice(-120)), weekLow: lo(h1.slice(-120)),
    change24h: round(((price - c1[Math.max(0, c1.length - 25)]) / c1[Math.max(0, c1.length - 25)]) * 100),
    session: sessionOf(now), news,
  };
}

function plainRead(f) {
  const dir = f.bias === 'up' ? 'Gold is trending up on every timeframe Luxe watches' : f.bias === 'down' ? 'Gold is trending down on every timeframe Luxe watches' : `Gold is mixed: 15 minutes ${f.m15}, 1 hour ${f.h1}, the slower drift ${f.slow}`;
  return {
    summary: `${dir}. It is at ${f.price}, ${f.change24h >= 0 ? 'up' : 'down'} ${Math.abs(f.change24h)}% in 24 hours, and moves about ${f.atr} an hour.`,
    favours: f.bias === 'up' ? 'buys' : f.bias === 'down' ? 'sells' : 'neither',
    watch: [f.dayHigh && `${f.dayHigh}: today's high`, f.dayLow && `${f.dayLow}: today's low`].filter(Boolean),
    caution: f.news[0] ? `${f.news[0].title} (${f.news[0].currency}) ${f.news[0].minutes > 0 ? `in ${f.news[0].minutes} min` : 'just out'}` : '',
  };
}

export async function marketRead(userId, { force = false } = {}) {
  const state = await deskState(userId);
  if (!force && state.market?.at && Date.now() - Date.parse(state.market.at) < MARKET_EVERY) return state.market;
  const f = await marketFacts();
  if (!f) return state.market || null;
  let read = plainRead(f);
  const o = await aiJSON(`You are a calm market analyst writing for a beginner who trades gold (XAUUSD) from signal channels. Below are MEASURED FACTS from price candles. Describe what the market is doing right now in plain English.
Rules: use ONLY these facts and numbers, never invent a level, a cause or a news story. Do not predict where the price will go and do not tell them to buy or sell; say what the facts currently favour and what would change that. No jargon without explaining it. No emoji.

FACTS (prices in USD):
${JSON.stringify(f)}
Meaning: m15/h1/slow = trend direction on 15-minute candles, 1-hour candles, and the 12-hour drift of the slow average. atr = the average size of a 1-hour candle. rsi = momentum 0-100 on the 1-hour chart (above 70 = stretched up, below 30 = stretched down). news = high-impact releases in the next 12 hours, minutes from now.

Return JSON: {"summary":"2-3 short sentences: what gold is doing and how strongly","favours":"buys|sells|neither","watch":["up to 3 items, each 'PRICE: why it matters' using only levels from the facts"],"caution":"one line on what could upset this (news ahead, stretched momentum, a quiet session), or empty"}`, { maxTokens: 700, temperature: 0.2 });
  if (o?.summary) {
    read = {
      summary: clip(o.summary, 420), favours: ['buys', 'sells', 'neither'].includes(o.favours) ? o.favours : read.favours,
      watch: (Array.isArray(o.watch) ? o.watch : []).map((x) => clip(x, 90)).filter(Boolean).slice(0, 3), caution: clip(o.caution, 200),
    };
  }
  const market = { ...f, ...read };
  await saveDesk(userId, { market });
  return market;
}

// ── Daily review ──
const bucket = (list, keyOf) => {
  const by = new Map();
  for (const x of list) { const k = keyOf(x); const g = by.get(k) || { key: k, n: 0, sum: 0, wins: 0 }; g.n += 1; g.sum += x.r; if (x.r > 0) g.wins += 1; by.set(k, g); }
  return [...by.values()].map((g) => ({ key: g.key, n: g.n, totalR: round(g.sum), avgR: round(g.sum / g.n) })).sort((a, b) => b.totalR - a.totalR);
};

export async function dailyReview(userId, { force = false, now = Date.now() } = {}) {
  const today = nairobiDay(now);
  const hour = (new Date(now).getUTCHours() + 3) % 24;
  const state = await deskState(userId);
  if (!force && (hour < 21 || state.review_tried === today)) return null;
  await saveDesk(userId, { review_tried: today }); // one go a day, whatever happens next

  const history = await deskHistory(userId);
  // "The day" is the last 24 hours, so trades that close late in the New York session are not lost between reviews.
  const day = history.filter((h) => h.closedAt > now - 24 * HOUR);
  if (!day.length) return null;
  const week = history.filter((h) => h.closedAt > now - 8 * 86400e3 && h.closedAt <= now - 24 * HOUR);
  const { data: scored } = await supabaseAdmin.from('trade_signals').select('id, desk').eq('user_id', userId).in('id', day.map((d) => d.id).slice(0, 200));
  const verdictOf = new Map((scored || []).filter((s) => s.desk?.v).map((s) => [s.id, s.desk.v]));
  const stampOf = new Map((scored || []).filter((s) => s.desk?.v).map((s) => [s.id, s.desk]));
  // The Desk's own mistakes today: winners it skipped and losers it backed, grouped so a pattern shows.
  const name = (x) => `${WINDOW_LABEL[windowOf(x.at)].split(' ')[0].toLowerCase()} ${x.side === 'BUY' ? 'buys' : 'sells'}`;
  const misses = day.filter((x) => verdictOf.get(x.id) === 'skip' && x.r > 0.5);
  const badPicks = day.filter((x) => ['take', 'small'].includes(verdictOf.get(x.id)) && x.r <= -0.9);
  const mistakes = [
    ...bucket(misses, name).map((g) => `Skipped ${g.n} winning ${g.key} (${rTxt(g.totalR)} missed)`),
    ...bucket(badPicks, name).map((g) => `Backed ${g.n} losing ${g.key} (${rTxt(g.totalR)})`),
  ].slice(0, 4);
  // What the market read says about today's results (from each signal's measured context, desk.x).
  const ctxOf = new Map((scored || []).filter((x) => x.desk?.x).map((x) => [x.id, x.desk.x]));
  const withCtx = day.filter((x) => ctxOf.has(x.id));
  const market = withCtx.length ? {
    trend: bucket(withCtx, (x) => ({ with: 'With the 15m and 1h trend', against: 'Against both trends', mixed: 'Trends mixed' }[ctxOf.get(x.id).t] || 'Unknown')),
    zone: bucket(withCtx, (x) => ({ good: 'Buying discount / selling premium', bad: 'Buying premium / selling discount', mid: 'Mid-range' }[ctxOf.get(x.id).z] || 'Unknown')),
    sweep: bucket(withCtx, (x) => ({ with: 'After a liquidity sweep for this side', against: 'Into a sweep against this side' }[ctxOf.get(x.id).w] || 'No sweep')),
    killzone: bucket(withCtx, (x) => ctxOf.get(x.id).k || 'Outside the killzones'),
  } : null;
  const coachToday = bucket(day.filter((x) => stampOf.get(x.id)?.c2?.v), (x) => `Coach said ${stampOf.get(x.id).c2.v}`);
  const misled = badPicks.map((x) => (stampOf.get(x.id)?.why || []).filter((w) => w.startsWith('👍')).join('; ')).filter(Boolean).slice(0, 3);
  const total = round(day.reduce((s, x) => s + x.r, 0));
  const facts = {
    date: today, signals: day.length, totalR: total, avgR: round(mean(day.map((x) => x.r))), won: day.filter((x) => x.r > 0).length,
    last7daysAvgR: week.length ? round(mean(week.map((x) => x.r))) : null,
    channels: bucket(day, (x) => x.source).slice(0, 12),
    timeOfDay: bucket(day, (x) => WINDOW_LABEL[windowOf(x.at)]),
    sides: bucket(day, (x) => (x.side === 'BUY' ? 'Buys' : 'Sells')),
    desk: bucket(day.filter((x) => verdictOf.has(x.id)), (x) => ({ take: 'Desk said take', small: 'Desk said small', skip: 'Desk said skip', learning: 'Not scored' }[verdictOf.get(x.id)] || 'Not scored')),
    deskMistakes: mistakes, votesThatMisledBadPicks: misled, market, coach: coachToday,
    best: (() => { const b = [...day].sort((a, c) => c.r - a.r)[0]; return `${b.source} ${b.side} ${b.symbol} ${rTxt(b.r)}`; })(),
    worst: (() => { const b = [...day].sort((a, c) => a.r - c.r)[0]; return `${b.source} ${b.side} ${b.symbol} ${rTxt(b.r)}`; })(),
  };
  const top = facts.channels[0]; const bottom = facts.channels[facts.channels.length - 1];
  let review = {
    headline: `${day.length} signal${day.length === 1 ? '' : 's'} closed for ${rTxt(total)} (${facts.won} won).`,
    worked: top && top.totalR > 0 ? [`${top.key}: ${rTxt(top.totalR)} from ${top.n}`] : [],
    hurt: bottom && bottom.totalR < 0 ? [`${bottom.key}: ${rTxt(bottom.totalR)} from ${bottom.n}`] : [],
    change: '',
  };
  const o = await aiJSON(`You are a senior prop-desk trader (20 years, gold/FX/indices, ICT: liquidity sweeps, premium/discount, fair value gaps, killzones, sessions, trend, news) coaching the Desk, a statistics engine that sorts copied Telegram signals. You review the last 24 hours of its paper trades. Use the market facts (trend, zone, sweep, killzone) to say which conditions made or lost money. R = profit divided by the amount risked (+1R = won the stake, -1R = lost it). Use ONLY the numbers below; never invent a trade, a reason or a market event. How the account is sized: a Desk "skip" trades only a 0.25% watch stake (its R barely moves the balance and is there to keep measuring), "small" trades 10% and "take" 15%, so judge the Desk's money mistakes on small and take, not skip. One day is a small sample: say so if a change rests on fewer than 10 trades. Be plain and direct, no flattery, no emoji. One day is a small sample: say so where it matters, and do not call something a pattern from one or two trades.

TODAY'S NUMBERS:
${JSON.stringify(facts)}

Return JSON: {"headline":"one sentence: the result and the single biggest reason for it","market_lesson":"one sentence on which market condition (trend, zone, sweep, killzone) worked or failed today, with its numbers, or empty","lesson":"one plain sentence on what the Desk's own mistakes (deskMistakes) show, or empty if there were none","worked":["up to 3 short lines, each with its numbers"],"hurt":["up to 3 short lines, each with its numbers"],"change":"ONE concrete change worth testing next, backed by a number above, or empty if nothing stands out"}`, { maxTokens: 800, temperature: 0.2 });
  if (o?.headline) review = { headline: clip(o.headline, 240), lesson: clip(o.lesson, 240), market_lesson: clip(o.market_lesson, 240), worked: (o.worked || []).map((x) => clip(x, 160)).slice(0, 3), hurt: (o.hurt || []).map((x) => clip(x, 160)).slice(0, 3), change: clip(o.change, 260) };

  // Learn: does another rule now beat the one in use on signals it could not have seen? Switch only on evidence.
  const current = ruleOf(state);
  const check = learnRule(history, current);
  const ruleNote = check.switched ? `The Desk now scores with "${RULES[check.use].label}": it made ${check.rows.find((r) => r.rule === check.use).all}R against ${check.rows.find((r) => r.rule === current).all}R on your history, and more over the latest 60 signals.` : '';
  await saveDesk(userId, {
    rule: check.use,
    rule_check: { at: new Date(now).toISOString(), rows: check.rows, use: check.use },
    ...(check.switched ? { rule_log: [{ at: new Date(now).toISOString(), from: current, to: check.use }, ...(state.rule_log || [])].slice(0, 5) } : {}),
  });
  if (check.switched) await notify({ title: '🧠 The Desk changed how it scores', body: ruleNote }, `desk-rule-${today}`);

  // The Coach earns the right to sort signals: his live calls against the Desk's on the same closed signals
  // (take 1.5x, small 1x, skip nothing). Trusted after 20+ shared signals at 3R+ ahead; untrusted if he falls behind.
  const { data: both } = await supabaseAdmin.from('trade_signals').select('id, desk').eq('user_id', userId).not('desk', 'is', null).order('created_at', { ascending: false }).limit(400);
  const rOf = new Map(history.map((h) => [h.id, h.r]));
  const pay = (v, r) => r * (v === 'take' ? 1.5 : v === 'small' ? 1 : 0);
  let n = 0; let coachR = 0; let deskR = 0;
  for (const x of both || []) {
    const r = rOf.get(x.id); const c = x.desk?.c2?.v; const d = x.desk?.c?.[current] || x.desk?.v;
    if (r == null || !c || !d) continue;
    n += 1; coachR += pay(c, r); deskR += pay(d, r);
  }
  const wasTrusted = state.coach_trusted === true;
  const trusted = wasTrusted ? n >= 20 && coachR >= deskR : n >= 20 && coachR >= deskR + 3;
  const coachNote = trusted !== wasTrusted ? (trusted ? `The Coach now sorts the signals: over ${n} closed signals his calls made ${coachR.toFixed(1)}R against the Desk's ${deskR.toFixed(1)}R.` : `The Desk sorts the signals again: the Coach fell behind (${coachR.toFixed(1)}R against ${deskR.toFixed(1)}R over ${n}).`) : '';
  await saveDesk(userId, { coach_trusted: trusted, coach_check: { at: new Date(now).toISOString(), n, coachR: Math.round(coachR * 10) / 10, deskR: Math.round(deskR * 10) / 10 } });
  if (coachNote) await notify({ title: trusted ? '🎓 The Coach takes over sorting' : '🎓 The Desk is back in charge', body: coachNote }, `desk-coach-${today}`);

  const entry = { date: today, n: day.length, totalR: total, won: facts.won, ...review, mistakes, ruleNote: [ruleNote, coachNote].filter(Boolean).join(' ') };
  const reviews = [entry, ...(state.reviews || []).filter((r) => r.date !== today)].slice(0, 7);
  await saveDesk(userId, { reviews });
  await notify({ title: `📊 Trading day: ${rTxt(total)} from ${day.length} signal${day.length === 1 ? '' : 's'}`, body: review.headline }, `desk-review-${today}`);
  return entry;
}

// From the tick (every minute): cheap unless something is due. Checked at most every 5 minutes per server instance.
let lastLook = 0;
export async function deskTick(userId) {
  if (Date.now() - lastLook < 5 * 60e3) return;
  lastLook = Date.now();
  await marketRead(userId).catch(() => null);
  await newsTick(userId).catch(() => null);
  await sniperTick(userId).catch(() => null);
  await dailyReview(userId).catch(() => null);
}


// The news desk, once an hour (lib/news-read.js). A strength-3 impact sends one push per headline.
async function newsTick(userId) {
  const state = await deskState(userId);
  if (state.news?.at && Date.now() - Date.parse(state.news.at) < 55 * 60e3) return;
  const news = await readNews();
  if (!news) { await saveDesk(userId, { news: { ...(state.news || {}), at: new Date().toISOString() } }); return; }
  // One push per story per 12 hours: a story that keeps making headlines (Nvidia all day) pushes once, not hourly.
  const now = Date.now();
  const pushed = (state.newsPushed || []).filter((p) => now - Date.parse(p.at) < 12 * 3600e3);
  const big = [];
  for (const x of news.impacts.filter((i) => i.strength === 3)) {
    const k = (x.story || x.headline).toLowerCase().slice(0, 40);
    if (big.length >= 2 || pushed.some((p) => p.k === k) || big.some((b) => b.k === k)) continue;
    big.push({ ...x, k });
  }
  await saveDesk(userId, { news, newsPushed: [...pushed, ...big.map((b) => ({ k: b.k, at: new Date(now).toISOString() }))].slice(-20) });
  for (const x of big) {
    const tag = `news-${x.k}`.replace(/[^\w-]/g, '').slice(0, 64);
    await notify({ title: `📰 ${x.market} ${x.direction === 'up' ? '▲' : '▼'} ${x.horizon === 'days' ? 'for days' : 'today'}`, body: `${x.headline} · ${x.why}`, url: '/trading' }, tag).catch(() => null);
  }
}

// The Coach's own sniper entries, inside the killzones only (lib/coach-sniper.js).
async function sniperTick(userId) {
  const state = await deskState(userId);
  const books = await sideBooks(userId);
  if (!books.coach_own?.since) return;
  await sniperScan(userId, { news: state.news, state, saveDesk, openPaperTrade, sideBookState, books, notify });
}
