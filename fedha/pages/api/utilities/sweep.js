import { runNestLinkSweep } from '../../../lib/nestlink';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  try {
    const triggerId = String(req.headers['x-sweep-trigger'] || `cron-${Math.floor(Date.now() / 60000)}`);
    const result = await runNestLinkSweep(triggerId);
    return res.status(200).json(result);
  } catch (error) {
    console.error('[fedha] NestLink sweep failed:', error.message);
    return res.status(502).json({ status: 'error', error: 'NestLink sweep failed.' });
  }
}
