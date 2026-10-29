import { requireUser } from '../../../lib/require-user';
import { recentSms, deviceInfo, setSims, setSmsWallet } from '../../../lib/sms-capture';

// GET: captured M-Pesa / Ziidi messages and the linked phone. PUT { sims } or { id, wallet_id }.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = await requireUser(req, res);
  if (!user) return;
  if (req.method === 'PUT') {
    if (req.body?.sims) await setSims(user.id, req.body.sims);
    if (req.body?.id) await setSmsWallet(user.id, req.body.id, req.body.wallet_id);
  } else if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const [sms, device] = await Promise.all([recentSms(user.id), deviceInfo(user.id)]);
  return res.status(200).json({ ...sms, device });
}
