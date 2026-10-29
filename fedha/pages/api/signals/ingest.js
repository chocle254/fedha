import crypto from 'crypto';
import { createSignal } from '../../../lib/signals';
import { isFollowUp, parseSignal } from '../../../lib/signal-parser';
import { placeSignalOnBrokers, getBrokerSettings, brokersActive } from '../../../lib/broker';
import { maybeAutoEnter } from '../../../lib/trading';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

// Called by the Telegram listener (telegram-listener/). Tracks the signal, then trades it on the MT5 demo accounts
// (XM, LiteFinance via MetaApi) when they are switched on, or as a Luxe paper trade otherwise.
const MAX_AGE_MS = 5 * 60 * 1000; // ignore stale messages (for example a backlog replayed after a reconnect)

function same(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Best effort: the inbox is a log, so a missing table (migration not run yet) must not break ingest.
// It keeps only the newest INBOX_KEEP messages: each new one removes whatever has fallen past that point.
// (Signals and trades live in their own tables and are never touched by this.)
const INBOX_KEEP = 100;
async function logInbox(row) {
  try {
    await supabaseAdmin.from('signal_inbox').insert(row);
    const { data: edge } = await supabaseAdmin.from('signal_inbox').select('created_at')
      .eq('user_id', row.user_id).order('created_at', { ascending: false }).range(INBOX_KEEP - 1, INBOX_KEEP - 1);
    if (edge?.[0]) await supabaseAdmin.from('signal_inbox').delete().eq('user_id', row.user_id).lt('created_at', edge[0].created_at);
  } catch { /* ignore */ }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const secret = process.env.INGEST_SECRET;
  const userId = process.env.SIGNAL_OWNER_USER_ID;
  if (!secret || !userId || !same(req.headers['x-ingest-secret'], secret)) return res.status(401).json({ error: 'Unauthorized' });

  const { source, text, externalId, messageDate, heartbeat, stats } = req.body || {};

  if (heartbeat) {
    const { error } = await supabaseAdmin.from('trade_settings').upsert(
      { user_id: userId, listener_seen_at: new Date().toISOString(), listener_stats: stats || null },
      { onConflict: 'user_id' }
    );
    return res.status(200).json({ ok: !error, error: error ? 'Run supabase-migration-signal-inbox.sql' : undefined });
  }

  if (!text || String(text).trim().length < 8) return res.status(200).json({ ok: false, skipped: 'empty' });
  const base = { user_id: userId, source: String(source || 'Telegram').slice(0, 60), text: String(text).slice(0, 2000), external_id: externalId ? String(externalId).slice(0, 120) : null };

  const sent = messageDate ? new Date(messageDate).getTime() : Date.now();
  if (Number.isFinite(sent) && Date.now() - sent > MAX_AGE_MS) {
    await logInbox({ ...base, outcome: 'stale', detail: 'Arrived more than 5 minutes late (backlog after a reconnect).' });
    return res.status(200).json({ ok: false, skipped: 'stale' });
  }
  if (isFollowUp(text)) {
    await logInbox({ ...base, outcome: 'follow_up', detail: 'Looks like a result or update post, not a new signal.' });
    return res.status(200).json({ ok: false, skipped: 'follow_up' });
  }

  const result = await createSignal({ userId, source, text, externalId });
  if (result.duplicate) return res.status(200).json({ ok: false, skipped: 'duplicate' });

  // MT5 accounts work from the signal's own prices (real XAUUSD), so they run even if the Binance stand-in could not be tracked.
  const parsed = parseSignal(text);
  const brokerSettings = await getBrokerSettings(userId);
  const onBrokers = parsed.ok && brokersActive(brokerSettings);
  const broker = onBrokers
    ? await placeSignalOnBrokers({ userId, parsed, source: base.source, signalKey: base.external_id || crypto.createHash('sha1').update(String(text)).digest('hex').slice(0, 20), signalId: result.ok ? result.signal.id : null })
    : null;
  const brokerNote = (broker || []).map((b) => `${b.account}: ${b.ok ? `${b.legs} leg${b.legs > 1 ? 's' : ''}, ${b.lots} lots ×${b.mult}` : b.skipped || b.error}`).join(' · ');
  const brokerTraded = (broker || []).some((b) => b.ok);

  if (result.ok) {
    // Luxe's own paper trade only when no MT5 account is on (or "paper too" is switched on).
    const trade = !onBrokers || brokerSettings.paper_too ? await maybeAutoEnter(userId, result.signal) : null;
    const paperTrade = trade ? (trade.ok ? 'entered' : trade.skipped || trade.error) : null;
    const detail = [brokerNote, trade && !trade.ok ? `Paper trade skipped: ${trade.error || trade.skipped}` : null].filter(Boolean).join(' · ') || null;
    await logInbox({ ...base, outcome: trade?.ok || brokerTraded ? 'traded' : 'tracked', signal_id: result.signal.id, detail });
    return res.status(200).json({ ok: true, symbol: result.signal.symbol, side: result.signal.side, paperTrade, broker });
  }
  if (brokerTraded) {
    await logInbox({ ...base, outcome: 'traded', detail: `${brokerNote} · (not tracked on Binance: ${result.error})` });
    return res.status(200).json({ ok: true, broker });
  }
  await logInbox({ ...base, outcome: 'unparsed', detail: result.error });
  return res.status(200).json({ ok: false, skipped: 'unparsed', error: result.error });
}
