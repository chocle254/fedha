import { requireUser } from '../../../lib/require-user';
import { recentSms, deviceInfo, setSims, setSmsWallet, setCategory, getRules } from '../../../lib/sms-capture';

// GET: captured M-Pesa / Ziidi messages and the linked phone. PUT { sims }, { id, wallet_id } or { id, category }
// (a category is remembered for that name: see setCategory in lib/sms-capture.js).
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = await requireUser(req, res);
  if (!user) return;
  if (req.method === 'PUT') {
    if (req.body?.sims) await setSims(user.id, req.body.sims);
    if (req.body?.id && 'wallet_id' in req.body) await setSmsWallet(user.id, req.body.id, req.body.wallet_id);
    if (req.body?.id && 'category' in req.body) await setCategory(user.id, req.body.id, req.body.category, req.body.scope);
  } else if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const [sms, device, rules] = await Promise.all([recentSms(user.id), deviceInfo(user.id), getRules(user.id)]);
  return res.status(200).json({ ...sms, device, rules, learned: Object.keys(rules).length });
}
