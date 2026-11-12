// lib/desk-coach.js — the Coach: a senior prop-desk trader (ICT, sessions, liquidity, news, trend) who reviews every
// signal BEFORE it is sorted, questions the Desk, and gives his own call.
//
//  Round 1  He sees the signal, the Desk's votes and the measured market read (lib/market-context.js), gives a first
//           view and picks up to 3 questions for the Desk from a fixed list.
//  Answers  Each question is answered from YOUR closed results (code, not the AI), so he can't be fed made-up numbers.
//  Round 2  With the answers he gives the final call: take / small / skip, conviction 1-5, and the reasons.
//
// His calls are saved on the signal (desk.c2) and traded on their own paper account (the Coach book). They decide how
// the main account is sized only after his live record beats the Desk's (learnCoach in lib/desk-daily.js), so an
// opinion can never lose money before it has proved itself.
import { aiJSON } from './ai-json';
import { windowOf } from './desk';

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const rTxt = (r) => `${r >= 0 ? '+' : ''}${r.toFixed(2)}R`;
const stat = (rows) => (rows.length ? `${rows.length} closed, ${rTxt(mean(rows.map((h) => h.r)))} each, ${Math.round((rows.filter((h) => h.r > 0).length / rows.length) * 100)}% won` : 'no closed signals yet');

export const QUESTIONS = {
  channel_session: 'How has this channel done at this time of day?',
  channel_side: 'How has this channel done on this side (buys or sells)?',
  channel_recent: "What were this channel's last 5 results?",
  side_session: 'How have all buys (or sells) done at this time of day?',
  trend_record: 'How have signals with and against the 1-hour trend done?',
  side_recent: 'How has this side done over the last 24 hours?',
};

function answer(q, history, f, at) {
  const ch = history.filter((h) => h.f.ch === f.ch);
  switch (q) {
    case 'channel_session': return stat(ch.filter((h) => h.f.win === f.win));
    case 'channel_side': return stat(ch.filter((h) => h.f.side === f.side));
    case 'channel_recent': { const last = [...ch].sort((a, b) => a.closedAt - b.closedAt).slice(-5); return last.length ? last.map((h) => rTxt(h.r)).join(', ') : 'no closed signals yet'; }
    case 'side_session': return stat(history.filter((h) => h.f.sw === f.sw));
    case 'trend_record': return `with the trend: ${stat(history.filter((h) => h.f.trend === 'with'))}; against: ${stat(history.filter((h) => h.f.trend === 'against'))}`;
    case 'side_recent': return stat(history.filter((h) => h.f.side === f.side && at - h.closedAt <= 24 * 3600e3));
    default: return 'unknown question';
  }
}

const PERSONA = `You are a senior prop-desk trader with 20 years on Wall Street and in London: gold, FX and indices. You trade ICT concepts (liquidity sweeps of prior highs and lows and the Asia range, premium vs discount, fair value gaps, killzones, market structure), sessions, trend, momentum and the news calendar. You coach "the Desk", a statistics engine that scores copied Telegram signals from past results. You are blunt, precise and never flatter. You only use the facts given; you never invent a price level, a news event or a result. When the market read and the record disagree, say which you trust and why.`;

// → { verdict, conviction, first, questions: [{q, a}], reasons, challenge } or null if the AI is unavailable.
export async function coachReview({ signal, desk, ctx, history }) {
  if (!desk || desk.verdict === 'learning' || !ctx) return null;
  const at = Date.now();
  const f = { ch: signal.source, side: signal.side, win: windowOf(at), sw: `${signal.side}@${windowOf(at)}` };
  const facts = {
    signal: { channel: signal.source, market: signal.symbol, side: signal.side, entry: signal.entry, stop: signal.stop_loss, targets: (signal.take_profits || []).slice(0, 3) },
    desk: { verdict: desk.verdict, votes: desk.votes, why: desk.why, diamond: !!desk.diamond },
    market: ctx,
  };
  const r1 = await aiJSON(`${PERSONA}

A signal just came in. Before the Desk sorts it, review it.
FACTS: ${JSON.stringify(facts)}
(market.trend: with/against/mixed = the trade versus the 15m and 1h trend; sideZone good = buying in discount or selling in premium; sweepFor/fvgFor with = liquidity sweep or fair value gap backing this side; news: clear/caution/danger.)

Questions you may ask the Desk (it answers from the real closed results): ${JSON.stringify(QUESTIONS)}
Return JSON: {"first":"your first read in one sentence","questions":["up to 3 question ids from the list that would settle it"]}`, { maxTokens: 300, temperature: 0.2, timeout: 15000 }).catch(() => null);
  if (!r1) return null;
  const qs = (Array.isArray(r1.questions) ? r1.questions : []).filter((q) => QUESTIONS[q]).slice(0, 3);
  const answers = qs.map((q) => ({ q: QUESTIONS[q], a: answer(q, history || [], f, at) }));
  const r2 = await aiJSON(`${PERSONA}

FACTS: ${JSON.stringify(facts)}
Your first read: ${clip(r1.first, 240)}
The Desk's answers from the real results: ${JSON.stringify(answers)}

Now make the call. take = full size, small = reduced size, skip = only a tiny watch stake.
Return JSON: {"verdict":"take|small|skip","conviction":1-5,"reasons":["2-4 short reasons, each naming the fact it rests on (ICT, session, trend, news or the record)"],"challenge":"one sentence on what the Desk got wrong, or 'agree' if nothing"}`, { maxTokens: 500, temperature: 0.2, timeout: 15000 }).catch(() => null);
  if (!r2 || !['take', 'small', 'skip'].includes(r2.verdict)) return null;
  return {
    verdict: r2.verdict,
    conviction: Math.max(1, Math.min(5, Math.round(Number(r2.conviction) || 3))),
    first: clip(r1.first, 200),
    questions: answers,
    reasons: (Array.isArray(r2.reasons) ? r2.reasons : []).map((x) => clip(x, 160)).filter(Boolean).slice(0, 4),
    challenge: clip(r2.challenge, 200),
  };
}

// Small copy saved on the signal (trade_signals.desk.c2).
export const coachStamp = (c) => (c ? { v: c.verdict, k: c.conviction, why: c.reasons.slice(0, 3), ch: c.challenge, q: c.questions.map((x) => x.q).slice(0, 3) } : null);
