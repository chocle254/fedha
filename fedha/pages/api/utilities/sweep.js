import { requireOwner, isCronRequest, sweepIfEnabled } from '../../../lib/nestlink-control';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  // Allowed callers: an external timer with CRON_SECRET, or the signed-in user (the Utilities page).
  if (!isCronRequest(req)) {
    const user = await requireOwner(req, res);
    if (!user) return;
  }

  try {
    const triggerId = String(req.headers['x-sweep-trigger'] || `cron-${Math.floor(Date.now() / 60000)}`);
    const result = await sweepIfEnabled(triggerId); // honours Start/Stop; fails closed
    if (result.status !== 'below_minimum' && result.status !== 'disabled' && result.status !== 'paused') {
      console.log('[fedha] NestLink sweep:', JSON.stringify({
        status: result.status, available_kes: result.available_kes,
        payout: result.payout_amount, fee: result.fee_kes, in_flight: result.in_flight
      }));
    }
    return res.status(200).json(result);
  } catch (error) {
    console.error('[fedha] NestLink sweep failed:', error.message);
    const unreadable = /Automation state unavailable/.test(error.message);
    return res.status(unreadable ? 503 : 502).json(unreadable
      ? { status: 'paused', error: 'Automation state unavailable.' }
      : { status: 'error', error: 'NestLink sweep failed.' });
  }
}
