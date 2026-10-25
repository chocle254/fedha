import { requireUser } from '../../../lib/require-user';
import { getPending, savePending } from '../../../lib/nestlink-control';
import { getNestLinkWithdrawalStatus } from '../../../lib/nestlink';

const DONE = 'COMPLETED';
const DEAD = ['FAILED', 'REVERSED'];

// GET: confirm pending payouts with NestLink and return the finished ones.
// POST { references: [...] }: the app has credited / notified these, so forget them.
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const user = await requireUser(req, res);
  if (!user) return;

  try {
    let list = await getPending();

    if (req.method === 'POST') {
      const refs = Array.isArray(req.body?.references) ? req.body.references.map(String) : [];
      list = list.filter(x => !refs.includes(x.reference));
      await savePending(list);
      return res.status(200).json({ ok: true, remaining: list.length });
    }

    let changed = false;
    for (const item of list) {
      if (item.status === DONE || DEAD.includes(item.status)) continue;
      try {
        const status = await getNestLinkWithdrawalStatus(item.reference);
        if (status !== item.status) { item.status = status; changed = true; }
      } catch (e) {
        console.error('[fedha] NestLink status check failed:', item.reference, e.message);
      }
    }
    if (changed) await savePending(list);

    return res.status(200).json({
      completed: list.filter(x => x.status === DONE),
      failed: list.filter(x => DEAD.includes(x.status)),
      waiting: list.filter(x => x.status !== DONE && !DEAD.includes(x.status)).length
    });
  } catch (e) {
    console.error('[fedha] NestLink credits error:', e.message);
    return res.status(500).json({ error: 'Payout state unavailable.' });
  }
}
