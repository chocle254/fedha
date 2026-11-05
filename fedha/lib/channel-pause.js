// lib/channel-pause.js — losing signal channels are paused for a week so they can't drain the balance.
//
// A channel is paused for 7 days (its signals are still recorded, but no paper or MT5 trade is placed) when:
//   • it has 5+ closed trades and loses money on average (-0.10R per trade or worse), or
//   • it hits 4 stop-losses in a row, or
//   • its report card already says "drop".
// After the week it is on probation: only its trades since it came back count, so its old record can't pause it
// again straight away. If it keeps losing (4+ new trades at -0.10R or worse, or 3 stop-losses in a row) it is
// blocked for good and its data deleted (lib/channel-block.js). You can pause or resume any channel by hand on the Trading page.
// State: trade_settings.broker_settings.pauses = { [source]: { until, reason, auto, at, resumed_at, times } }.
import { supabaseAdmin } from './supabaseAdmin';
import { getSettings, notify, isMain } from './trading';
import { groupReport } from './trading-core';
import { blockChannel, isBlocked } from './channel-block';

export const PAUSE_DAYS = 7;
export const PAUSE_RULES = {
  fresh: { minTrades: 5, avgR: -0.1, streak: 4 },
  probation: { minTrades: 4, avgR: -0.1, streak: 3 },
};

async function writePauses(userId, change) {
  const s = await getSettings(userId); // fresh read, so the ladder's own writes are kept
  const bs = s.broker_settings || {};
  const pauses = change({ ...(bs.pauses || {}) });
  await supabaseAdmin.from('trade_settings').update({ broker_settings: { ...bs, pauses } }).eq('user_id', userId);
  return pauses;
}

export async function pauseChannel(userId, source, { days = PAUSE_DAYS, reason = 'Paused by you', auto = false } = {}) {
  const until = new Date(Date.now() + days * 864e5).toISOString();
  await writePauses(userId, (p) => ({ ...p, [source]: { until, reason, auto, at: new Date().toISOString(), resumed_at: null, times: (p[source]?.times || 0) + 1 } }));
  return until;
}

export async function resumeChannel(userId, source) {
  const now = new Date().toISOString();
  await writePauses(userId, (p) => ({ ...p, [source]: { ...(p[source] || {}), until: null, resumed_at: now, reason: p[source]?.reason || '' } }));
}

// Called before a channel's signal is traded. Returns { paused: false } or { paused: true, until, reason }.
export async function channelGate(userId, source, settings = null) {
  if (!source || source === 'Manual') return { paused: false };
  const s = settings || (await getSettings(userId));
  if (isBlocked(s, source)) return { paused: true, blocked: true, reason: 'blocked' };
  const p = s.broker_settings?.pauses?.[source];
  if (p?.until && Date.parse(p.until) > Date.now()) return { paused: true, until: p.until, reason: p.reason };

  // Judge it: all its trades if it was never paused, or only those since it came back (probation).
  const since = p ? p.resumed_at || p.until : null;
  let q = supabaseAdmin.from('paper_trades').select('*').eq('user_id', userId).eq('source', source).not('signal_id', 'is', null).in('status', ['won', 'lost']).limit(1000);
  if (since) q = q.gte('closed_at', since);
  const { data } = await q;
  const g = groupReport((data || []).filter(isMain))[0];
  if (!g) return { paused: false };
  const rule = since ? PAUSE_RULES.probation : PAUSE_RULES.fresh;
  let reason = null;
  if (g.closed >= rule.minTrades && g.avgR <= rule.avgR) reason = `losing ${g.avgR.toFixed(2)}R per trade over ${g.closed} trades${since ? ' since it came back' : ''}`;
  else if (g.streak >= rule.streak) reason = `${g.streak} stop-losses in a row`;
  else if (!since && g.verdict === 'drop') reason = `its report card says drop (${g.confidence}% confident, ${g.avgR.toFixed(2)}R per trade)`;
  if (!reason) return { paused: false };

  // Lost again on probation, after a pause: blocked for good and its data deleted (lib/channel-block.js).
  if (since) {
    await blockChannel(userId, source, reason);
    return { paused: true, blocked: true, reason };
  }

  const until = await pauseChannel(userId, source, { reason, auto: true });
  const back = new Date(until).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  await notify({ title: `⏸ ${source} paused for a week`, body: `${reason[0].toUpperCase()}${reason.slice(1)}. Its signals are still recorded, but no trades until ${back}. Then it gets a fresh chance on probation.` }, `channel-pause-${source}`).catch(() => null);
  return { paused: true, until, reason };
}
