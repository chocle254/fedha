import { requireOwner } from '../../../lib/nestlink-control';

function getAuthHeader() {
  const username = process.env.UPESIPAY_API_USERNAME;
  const password = process.env.UPESIPAY_API_PASSWORD;
  if (!username || !password) return null;
  return 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed.' }); }
  const user = await requireOwner(req, res); if (!user) return;
  const authorization = getAuthHeader();
  if (!authorization) return res.status(200).json({ configured: false, message: 'UpesiPay credentials are not configured on the server.' });
  try {
    const response = await fetch('https://upesipay.com/api/v2/account/balance/', {
      method: 'GET',
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(12000)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success === false) {
      console.error('[fedha] UpesiPay balance error:', response.status, result.error_code || result.message || '');
      return res.status(502).json({ error: result.message || 'UpesiPay could not return wallet balances.' });
    }
    const service = result?.data?.service_wallet_balance;
    if (service === undefined || service === null || !Number.isFinite(Number(service))) {
      return res.status(502).json({ error: 'UpesiPay response did not include a valid service wallet balance.' });
    }
    return res.status(200).json({ configured: true, serviceWalletBalance: Number(service), checkedAt: new Date().toISOString() });
  } catch (error) {
    console.error('[fedha] UpesiPay balance request failed:', error.message);
    return res.status(502).json({ error: 'Could not retrieve the UpesiPay service wallet balance.' });
  }
}
