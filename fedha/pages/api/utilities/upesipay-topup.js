import { requireOwner } from '../../../lib/nestlink-control';

function getAuthHeader() {
  const username = process.env.UPESIPAY_API_USERNAME;
  const password = process.env.UPESIPAY_API_PASSWORD;
  if (!username || !password) return null;
  return 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed.' }); }
  const user = await requireOwner(req, res); if (!user) return;
  const authorization = getAuthHeader();
  if (!authorization) return res.status(503).json({ error: 'UpesiPay credentials are not configured on the server.' });

  const amount = Number(req.body?.amount);
  const phone = String(req.body?.phone_number || '').trim().replace(/[\s()-]/g, '');
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100000) {
    return res.status(400).json({ error: 'Enter a whole-number top-up amount between KES 1 and KES 100,000.' });
  }
  if (!/^(?:\+?254|0)7\d{8}$/.test(phone) && !/^(?:\+?254|0)1\d{8}$/.test(phone)) {
    return res.status(400).json({ error: 'Enter a valid Kenyan M-Pesa number, e.g. 07XXXXXXXX or 2547XXXXXXXX.' });
  }
  try {
    const response = await fetch('https://upesipay.com/api/v2/topup/', {
      method: 'POST',
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, phone_number: phone }),
      signal: AbortSignal.timeout(15000)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success === false) {
      console.error('[fedha] UpesiPay service wallet top-up error:', response.status, result.error_code || result.message || '');
      return res.status(response.status >= 400 && response.status < 500 ? 400 : 502).json({ error: result.message || 'UpesiPay could not initiate the service wallet top-up.' });
    }
    return res.status(200).json({
      success: true,
      status: result.status || 'QUEUED',
      reference: result.reference || null,
      checkoutRequestId: result.CheckoutRequestID || result.checkout_request_id || null,
      amount
    });
  } catch (error) {
    console.error('[fedha] UpesiPay top-up request failed:', error.message);
    return res.status(502).json({ error: 'Could not reach UpesiPay. Check the wallet before retrying to avoid duplicate top-ups.' });
  }
}
