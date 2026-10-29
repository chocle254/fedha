import { requireUser } from '../../../lib/require-user';
import { pairDevice } from '../../../lib/sms-capture';

// Links the Android app on this phone to the signed-in account. Returns an intent link the page opens; the app's
// PairActivity saves the token and asks for SMS permission.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requireUser(req, res);
  if (!user) return;
  const token = await pairDevice(user.id);
  const link = `intent://pair?token=${encodeURIComponent(token)}#Intent;scheme=luxe;package=com.chocle254.fedha;end`;
  return res.status(200).json({ ok: true, link });
}
