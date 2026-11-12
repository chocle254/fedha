import { requireUser } from '../../../lib/require-user';
import { getSettings, getAccount, sideBooks, sideBookState, resetSideBook, SIDE_BOOKS } from '../../../lib/trading';

// Trading → Paper accounts: the main account next to the side books (Big on takes, Diamonds only), all on the
// same signals, so each way of trading can be watched before the real account is touched.
// GET → { main, books: [...] }. POST { reset: 'takes' | 'diamond' } starts that book again from $1,000.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    if (req.method === 'POST') {
      const name = String(req.body?.reset || '');
      if (!SIDE_BOOKS[name]) return res.status(400).json({ error: 'Unknown account.' });
      await resetSideBook(user.id, name);
    } else if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const settings = await getSettings(user.id);
    const [acct, books] = await Promise.all([getAccount(user.id, settings), sideBooks(user.id, settings)]);
    const side = await Promise.all(Object.keys(SIDE_BOOKS).map((k) => sideBookState(user.id, k, books[k].since)));
    return res.status(200).json({
      main: { name: 'main', label: 'Main (Desk 15 / 10 / 0.25%)', start: Number(settings.paper_balance), equity: acct.equity, openRisk: acct.openRisk, since: settings.broker_settings?.paper_since || null },
      books: side,
    });
  } catch (e) {
    return res.status(500).json({ error: 'Could not load the paper accounts.' });
  }
}
