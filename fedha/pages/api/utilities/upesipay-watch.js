import { requireUser } from '../../../lib/require-user';
import { isCronRequest } from '../../../lib/nestlink-control';
import { evaluateServiceWalletAlert } from '../../../lib/upesipay-alert';

// Checks the UpesiPay service wallet and sends the zero-balance alert when due.
// Callable by the signed-in app, or by an external timer with CRON_SECRET (works with the app closed).
export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed.' }); }
  if (!isCronRequest(req)) {
    const user = await requireUser(req, res);
    if (!user) return;
  }
  const username = process.env.UPESIPAY_API_USERNAME;
  const password = process.env.UPESIPAY_API_PASSWORD;
  if (!username || !password) return res.status(200).json({ configured: false });

  try {
    const response = await fetch('https://upesipay.com/api/v2/account/balance/', {
      method: 'GET',
      headers: { Authorization: 'Basic ' + Buffer.from(username + ':' + password).toString('base64'), 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(12000)
    });
    const result = await response.json().catch(() => ({}));
    const balance = Number(result?.data?.service_wallet_balance);
    if (!response.ok || result.success === false || !Number.isFinite(balance)) {
      console.error('[fedha] UpesiPay watch: no valid balance', response.status);
      return res.status(502).json({ error: 'UpesiPay did not return a valid balance.' });
    }
    const outcome = await evaluateServiceWalletAlert(balance);
    return res.status(200).json({ configured: true, balance, ...outcome });
  } catch (e) {
    console.error('[fedha] UpesiPay watch failed:', e.message);
    return res.status(502).json({ error: 'UpesiPay check failed.' });
  }
}
