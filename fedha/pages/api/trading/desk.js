import { requireUser } from '../../../lib/require-user';
import { deskHistory, deskState, saveDesk, walkForward, liveResults, DESK } from '../../../lib/desk';
import { marketRead } from '../../../lib/desk-daily';

// Trading → Channels → The Desk: the market read, how the Desk's picks have done (on history and since it went
// live), the latest scored signals, the daily reviews, and the real-money switch.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method === 'POST') {
    const b = req.body || {};
    if (typeof b.real === 'boolean') await saveDesk(user.id, { real: b.real });
    if (b.refresh) await marketRead(user.id, { force: true }).catch(() => null);
  } else if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const history = await deskHistory(user.id);
    const [state, live] = await Promise.all([deskState(user.id), liveResults(user.id, history)]);
    return res.status(200).json({
      real: state.real === true,
      market: state.market || null,
      reviews: state.reviews || [],
      closed: history.length, needed: DESK.minHistory,
      history: walkForward(history),
      live,
    });
  } catch (e) {
    return res.status(500).json({ error: 'Could not load the Desk.' });
  }
}
