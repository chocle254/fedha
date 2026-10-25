import crypto from 'crypto';
import { runNestLinkSweep } from '../../../lib/nestlink';
import { requireOwner, getAutomation, recordSweep, addPending } from '../../../lib/nestlink-control';

function cronAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(String(req.headers.authorization || ''));
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  // Allowed callers: an external timer with CRON_SECRET, or the signed-in owner (the Utilities page).
  if (!cronAuthorized(req)) {
    const user = await requireOwner(req, res);
    if (!user) return;
  }

  // The Start/Stop switch decides whether anything is swept. Fail closed.
  try {
    const state = await getAutomation();
    if (!state.enabled) return res.status(200).json({ status: 'paused' });
  } catch (e) {
    console.error('[fedha] NestLink sweep paused:', e.message);
    return res.status(503).json({ status: 'paused', error: 'Automation state unavailable.' });
  }

  try {
    const triggerId = String(req.headers['x-sweep-trigger'] || `cron-${Math.floor(Date.now() / 60000)}`);
    const result = await runNestLinkSweep(triggerId);
    if (result.status === 'submitted') {
      const reference = result.withdrawal?.data?.reference || null;
      await recordSweep({ payout: result.payout_amount, fee: result.fee_kes, reference });
      if (reference) {
        try { await addPending({ reference, payout: result.payout_amount, fee: result.fee_kes }); }
        catch (e) { console.error('[fedha] Could not queue payout for crediting:', e.message); }
      }
    }
    if (result.status !== 'below_minimum' && result.status !== 'disabled') {
      console.log('[fedha] NestLink sweep:', JSON.stringify({
        status: result.status, available_kes: result.available_kes,
        payout: result.payout_amount, fee: result.fee_kes, in_flight: result.in_flight
      }));
    }
    return res.status(200).json(result);
  } catch (error) {
    console.error('[fedha] NestLink sweep failed:', error.message);
    return res.status(502).json({ status: 'error', error: 'NestLink sweep failed.' });
  }
}
