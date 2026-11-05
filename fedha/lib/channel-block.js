// lib/channel-block.js — channels that fail their second chance are blocked for good and their data deleted.
//
// A losing channel is first paused for a week (lib/channel-pause.js). When it comes back it is on probation; if it
// loses again there (the probation rule), it is BLOCKED instead of paused again:
//   • its paper trades, signals and inbox messages are deleted, to keep database space for good channels;
//   • one line about it is kept forever (broker_settings.blocked): how it did and why, so we always know it was
//     tested and failed, and new posts from it are ignored at ingest (nothing is stored for it again).
// The paper balance doesn't jump when its trades disappear: their profit/loss since the last reset is kept as
// broker_settings.blocked_pnl and still counted by getAccount (lib/trading.js).
// Real MT5 trades (broker_trades) are never deleted.
import { supabaseAdmin } from './supabaseAdmin';
import { getSettings, notify, isMain } from './trading';
import { groupReport } from './trading-core';

const KEEP_BLOCKED = 300; // summaries kept (about 150 bytes each)

export const isBlocked = (settings, source) => !!(source && settings?.broker_settings?.blocked?.[source]);

export async function blockChannel(userId, source, reason) {
  const { data: trades } = await supabaseAdmin.from('paper_trades').select('*').eq('user_id', userId).eq('source', source).limit(5000);
  const main = (trades || []).filter(isMain);
  const g = groupReport(main.filter((t) => ['won', 'lost'].includes(t.status) && t.signal_id))[0];

  const s = await getSettings(userId); // fresh read, so other writers' changes are kept
  const bs = s.broker_settings || {};
  const since = bs.paper_since || '';
  // Profit or loss these trades put into the current paper balance, so removing them doesn't move it.
  const pnl = main.filter((t) => String(t.created_at || '') >= since && ['won', 'lost', 'expired'].includes(t.status))
    .reduce((a, t) => a + (Number(t.pnl_usdt) || 0), 0);
  const prevAdj = bs.blocked_pnl?.since === since ? Number(bs.blocked_pnl.pnl) || 0 : 0;

  const blocked = {
    ...(bs.blocked || {}),
    [source]: { at: new Date().toISOString(), reason, trades: g?.closed || 0, avgR: g ? Math.round(g.avgR * 100) / 100 : null, winPct: g?.winRate != null ? Math.round(g.winRate) : null, pauses: bs.pauses?.[source]?.times || 0 },
  };
  const keep = Object.entries(blocked).sort((a, b) => (a[1].at < b[1].at ? 1 : -1)).slice(0, KEEP_BLOCKED);
  const pauses = { ...(bs.pauses || {}) };
  delete pauses[source];
  const ladder = bs.ladder ? { ...bs.ladder, channels: { ...(bs.ladder.channels || {}) } } : bs.ladder;
  if (ladder?.channels) delete ladder.channels[source];
  await supabaseAdmin.from('trade_settings').update({
    broker_settings: { ...bs, blocked: Object.fromEntries(keep), pauses, ladder, blocked_pnl: { since, pnl: Math.round((prevAdj + pnl) * 100) / 100 } },
  }).eq('user_id', userId);

  // Delete its data (the summary above is what remains).
  const del = await Promise.all([
    supabaseAdmin.from('paper_trades').delete({ count: 'exact' }).eq('user_id', userId).eq('source', source),
    supabaseAdmin.from('trade_signals').delete({ count: 'exact' }).eq('user_id', userId).eq('source', source),
    supabaseAdmin.from('signal_inbox').delete({ count: 'exact' }).eq('user_id', userId).eq('source', source),
  ]);
  const removed = del.reduce((a, r) => a + (r.count || 0), 0);

  await notify({
    title: `🚫 ${source} blocked`,
    body: `It lost again after its pause (${reason}). Its ${removed} saved records were deleted to make room; its new posts are ignored. Leave or mute it in Telegram whenever you like.`,
  }, `channel-block-${source}`).catch(() => null);
  return { removed };
}
