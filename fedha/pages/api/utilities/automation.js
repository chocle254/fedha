import { requireOwner, getAutomation, setAutomation } from '../../../lib/nestlink-control';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const user = await requireOwner(req, res);
  if (!user) return;
  try {
    if (req.method === 'POST') {
      if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be true or false.' });
      await setAutomation(req.body.enabled);
      console.log('[fedha] NestLink automation', req.body.enabled ? 'STARTED' : 'STOPPED');
    }
    return res.status(200).json(await getAutomation());
  } catch (e) {
    console.error('[fedha] NestLink automation error:', e.message);
    return res.status(500).json({ error: 'Automation state unavailable. Run supabase-migration-nestlink-automation.sql.' });
  }
}
