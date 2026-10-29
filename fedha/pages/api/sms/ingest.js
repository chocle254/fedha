import { ingest } from '../../../lib/sms-capture';

// Called by the Android app with its device token (x-device-token). Body: { messages: [{ sender, body, slot, at }] }.
// Only M-Pesa / Ziidi texts are accepted; everything else is dropped unread.
export const config = { api: { bodyParser: { sizeLimit: '512kb' } } };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const r = await ingest(String(req.headers['x-device-token'] || ''), req.body?.messages);
  return res.status(r.error ? 401 : 200).json(r);
}
