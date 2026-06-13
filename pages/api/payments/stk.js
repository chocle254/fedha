import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { genId } from '../../../lib/utils';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = process.env.PAYHERO_BASIC_AUTH_TOKEN;
  const channelId = process.env.PAYHERO_CHANNEL_ID;
  if (!token || !channelId) return res.status(500).json({ error: 'PayHero not configured' });

  const { user_id, phone, amount } = req.body;
  if (!user_id || !phone) return res.status(400).json({ error: 'user_id and phone are required' });

  // Normalise phone to 2547XXXXXXXX
  let p = String(phone).replace(/\D/g, '');
  if (p.startsWith('0')) p = '254' + p.slice(1);
  if (p.startsWith('7') || p.startsWith('1')) p = '254' + p;

  const amt = Number(amount) || Number(process.env.PRO_PRICE_KES) || 300;
  const reference = `fedha_${user_id.slice(0, 8)}_${genId().slice(0, 8)}`;

  // Record the pending payment first (idempotent reference)
  await supabaseAdmin.from('payments').insert({
    external_reference: reference, user_id, amount: amt, phone: p, status: 'pending',
  });
  await supabaseAdmin.from('subscriptions').upsert({ user_id, status: 'pending', plan: 'free' });

  try {
    const resp = await fetch('https://backend.payhero.co.ke/api/v2/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body: JSON.stringify({
        amount: amt,
        phone_number: p,
        channel_id: Number(channelId),
        provider: 'm-pesa',
        external_reference: reference,
        customer_name: 'Fedha Pro',
        callback_url: `${process.env.NEXT_PUBLIC_BASE_URL}/api/payments/callback`,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      await supabaseAdmin.from('payments').update({ status: 'failed' }).eq('external_reference', reference);
      return res.status(502).json({ error: data?.error_message || 'STK push failed', detail: data });
    }
    // PayHero returns a CheckoutRequestID/reference; client polls /status with our reference.
    return res.status(200).json({ reference, providerResponse: data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
