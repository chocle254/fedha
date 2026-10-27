import crypto from 'crypto';
import { createSignal } from '../../../lib/signals';
import { isFollowUp } from '../../../lib/signal-parser';
import { maybeAutoEnter } from '../../../lib/trading';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

// Called by the Telegram listener (telegram-listener/). PAPER TRACKING ONLY: no orders are placed.
const MAX_AGE_MS = 5 * 60 * 1000; // ignore stale messages (for example a backlog replayed after a reconnect)

function same(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Best effort: the inbox is a log, so a missing table (migration not run yet) must not break ingest.
async function logInbox(row) {
  try { await supabaseAdmin.from('signal_inbox').insert(row); } catch { /* ignore */ }
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
  if (result.ok) {
    const trade = await maybeAutoEnter(userId, result.signal); // paper trade only, if automation is switched on
    const paperTrade = trade ? (trade.ok ? 'entered' : trade.skipped || trade.error) : null;
    await logInbox({ ...base, outcome: trade?.ok ? 'traded' : 'tracked', signal_id: result.signal.id, detail: trade && !trade.ok ? `Auto-trade skipped: ${trade.error || trade.skipped}` : null });
    return res.status(200).json({ ok: true, symbol: result.signal.symbol, side: result.signal.side, paperTrade });
  }
  if (result.duplicate) return res.status(200).json({ ok: false, skipped: 'duplicate' });
  await logInbox({ ...base, outcome: 'unparsed', detail: result.error });
  return res.status(200).json({ ok: false, skipped: 'unparsed', error: result.error });
}
