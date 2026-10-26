import crypto from 'crypto';
import { createSignal } from '../../../lib/signals';

// Called by the Telegram listener (telegram-listener/). PAPER TRACKING ONLY: no orders are placed.
const MAX_AGE_MS = 5 * 60 * 1000; // ignore stale messages (for example a backlog replayed after a reconnect)

function same(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const secret = process.env.INGEST_SECRET;
  const userId = process.env.SIGNAL_OWNER_USER_ID;
  if (!secret || !userId || !same(req.headers['x-ingest-secret'], secret)) return res.status(401).json({ error: 'Unauthorized' });

  const { source, text, externalId, messageDate } = req.body || {};
  if (!text || String(text).trim().length < 8) return res.status(200).json({ ok: false, skipped: 'empty' });
  const sent = messageDate ? new Date(messageDate).getTime() : Date.now();
  if (Number.isFinite(sent) && Date.now() - sent > MAX_AGE_MS) return res.status(200).json({ ok: false, skipped: 'stale' });

  const result = await createSignal({ userId, source, text, externalId });
  if (result.ok) return res.status(200).json({ ok: true, symbol: result.signal.symbol, side: result.signal.side });
  if (result.duplicate) return res.status(200).json({ ok: false, skipped: 'duplicate' });
  return res.status(200).json({ ok: false, skipped: 'unparsed', error: result.error });
}
