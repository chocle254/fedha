import { requireUser } from '../../../lib/require-user';
import { getPending, savePending, isCronRequest } from '../../../lib/nestlink-control';
import { settlePending, isFinal } from '../../../lib/nestlink-settle';

// GET: confirm pending payouts with NestLink, push a notification for each finished one, and
//      return them. The signed-in app (or an external timer with CRON_SECRET) can call this.
// POST { references: [...] }: the app has credited / notified these, so forget them.
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const viaCron = req.method === 'GET' && isCronRequest(req);
  if (!viaCron) {
    const user = await requireUser(req, res);
    if (!user) return;
  }

  try {
    if (req.method === 'POST') {
      const refs = Array.isArray(req.body?.references) ? req.body.references.map(String) : [];
      const list = (await getPending()).filter((x) => !refs.includes(x.reference));
      await savePending(list);
      return res.status(200).json({ ok: true, remaining: list.length });
    }

    const list = await settlePending();
    return res.status(200).json({
      completed: list.filter((x) => x.status === 'COMPLETED'),
      failed: list.filter((x) => x.status === 'FAILED' || x.status === 'REVERSED'),
      waiting: list.filter((x) => !isFinal(x.status)).length
    });
  } catch (e) {
    console.error('[fedha] NestLink credits error:', e.message);
    return res.status(500).json({ error: 'Payout state unavailable.' });
  }
}
