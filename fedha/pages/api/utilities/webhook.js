import crypto from 'crypto';
import { runNestLinkSweep } from '../../../lib/nestlink';

export const config = { api: { bodyParser: false } };

async function rawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function validSignature(raw, header, secret) {
  if (!header || !secret) return false;
  const supplied = String(header).replace(/^sha256=/i, '').trim();
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw).digest();
  const actual = Buffer.from(supplied, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function getEventType(event) {
  return String(event?.event_type || event?.type || event?.event || event?.name || '').trim().toLowerCase();
}

function isSuccessfulIncomingFundsEvent(event, eventType) {
  const configuredType = String(process.env.NESTLINK_SWEEP_TRIGGER_EVENT || '').trim().toLowerCase();
  if (!configuredType || eventType !== configuredType) return false;
  if (/withdraw|payout|refund|reversal/.test(eventType)) return false;
  if (!/(deposit|incoming|funds|credit)/.test(eventType)) return false;

  const status = String(
    event?.status ||
    event?.data?.status ||
    event?.deposit?.status ||
    event?.data?.deposit?.status ||
    ''
  ).trim().toLowerCase();
  return ['completed', 'complete', 'success', 'succeeded', 'successful'].includes(status);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed. NestLink must send a POST webhook.' });
  }

  try {
    const raw = await rawBody(req);
    const secret = process.env.NESTLINK_WEBHOOK_SECRET;

    // If a webhook secret is configured, enforce NestLink's HMAC signature.
    // If NestLink cannot save a secret, accept only the explicitly configured,
    // successful incoming-funds event below. Keep the payout recipient fixed
    // in Vercel env and never derive it from webhook payload data.
    if (secret && !validSignature(raw, req.headers['x-nestlink-signature'], secret)) {
      return res.status(401).json({ error: 'Invalid webhook signature.' });
    }

    let event;
    try {
      event = JSON.parse(raw.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON payload.' });
    }

    const eventType = getEventType(event);
    if (!isSuccessfulIncomingFundsEvent(event, eventType)) {
      return res.status(202).json({
        ok: true,
        sweep: 'ignored',
        reason: 'Event is not a configured successful incoming-funds event.'
      });
    }

    // Reusing the same event identifier makes retries idempotent at NestLink.
    const eventId = event.id || event.event_id || event.data?.id ||
      event.reference || event.data?.reference ||
      crypto.createHash('sha256').update(raw).digest('hex');
    const result = await runNestLinkSweep(String(eventId));
    return res.status(200).json({ ok: true, sweep: result.status });
  } catch (error) {
    console.error('[fedha] NestLink webhook failed:', error.message);
    return res.status(500).json({ error: 'Webhook processing failed.' });
  }
}
