// Learns which trailing-stop style suits each Telegram channel, from that channel's own closed trades.
// Every closed signal trade is replayed on the real price candles once per style (lib/trading-core TRAIL_MODES),
// and the style with the best average result in R wins (pickTrail). Runs at most every 6 hours from the tick.
import { supabaseAdmin } from './supabaseAdmin';
import { evaluateTrade, TRAIL_MODES, TRAIL_DEFAULT, pickTrail } from './trading-core';
import { candlesSince, atrBefore } from './trading';

const EVERY_MS = 6 * 3600e3;
const PER_CHANNEL = 30;   // newest closed trades replayed per channel
const MAX_TRADES = 120;   // per run, to stay well inside Binance and Vercel limits
const LIFE_MS = 7 * 86400e3;

export async function learnTrailProfiles(userId, { force = false } = {}) {
  const { data: st, error: stErr } = await supabaseAdmin.from('trade_settings').select('trail_profiles').eq('user_id', userId).maybeSingle();
  if (stErr) return { skipped: 'Run supabase-migration-smart-trailing.sql first.' };
  const prev = st?.trail_profiles || {};
  if (!force && prev.updated_at && Date.now() - new Date(prev.updated_at).getTime() < EVERY_MS) return { skipped: 'recent' };

  const { data: rows } = await supabaseAdmin.from('paper_trades')
    .select('*').eq('user_id', userId).not('signal_id', 'is', null).in('status', ['won', 'lost'])
    .not('stop_loss', 'is', null).order('created_at', { ascending: false }).limit(600);
  const bySource = {};
  for (const t of rows || []) {
    const list = (bySource[t.source] = bySource[t.source] || []);
    if (list.length < PER_CHANNEL) list.push(t);
  }

  const channels = { ...(prev.channels || {}) };
  let replayed = 0;
  for (const [source, trades] of Object.entries(bySource)) {
    const scores = Object.fromEntries(TRAIL_MODES.map((m) => [m, { n: 0, sumR: 0 }]));
    for (const t of trades) {
      if (replayed >= MAX_TRADES) break;
      const start = new Date(t.created_at).getTime();
      const candles = (await candlesSince(t.symbol, start))?.filter((k) => k.t <= start + LIFE_MS);
      if (!candles?.length) continue;
      const atr = Number(t.trail_atr) || (await atrBefore(t.symbol, start));
      const risk = Number(t.actual_risk_usdt) || Number(t.risk_usdt);
      if (!(risk > 0)) continue;
      // Replay from the moment it was placed: a trade that filled straight away starts open.
      const atOpen = { ...t, status: t.filled_at && new Date(t.filled_at).getTime() - start < 120e3 ? 'open' : 'pending', filled_at: null };
      const end = Math.min(Date.now(), start + LIFE_MS);
      for (const mode of TRAIL_MODES) {
        const r = evaluateTrade(atOpen, candles, end, { trail: { mode, atr } });
        if (r.pnl_usdt == null) continue;
        scores[mode].n++;
        scores[mode].sumR += r.pnl_usdt / risk;
      }
      replayed++;
    }
    const summary = Object.fromEntries(Object.entries(scores).map(([m, v]) => [m, { n: v.n, avgR: v.n ? Math.round((v.sumR / v.n) * 1000) / 1000 : null }]));
    const mode = pickTrail(summary);
    channels[source] = { mode, scores: summary, trades: summary[TRAIL_DEFAULT]?.n || 0, learned_at: new Date().toISOString() };
  }

  const profiles = { updated_at: new Date().toISOString(), channels };
  await supabaseAdmin.from('trade_settings').update({ trail_profiles: profiles }).eq('user_id', userId);
  return { ok: true, channels: Object.keys(bySource).length, replayed };
}
