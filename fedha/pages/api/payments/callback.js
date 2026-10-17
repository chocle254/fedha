import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  // PayHero is given a secret in the callback URL (see stk.js). Anyone else
  // posting "Status: Success" here would otherwise get Pro for free.
  const secret = process.env.PAYHERO_CALLBACK_SECRET;
  if (!secret || req.query.secret !== secret) {
    console.warn('[fedha] payhero callback rejected: missing/wrong secret');
    return res.status(401).json({ ok: false });
  }
  try {
    // PayHero posts a response object; shape: { response: { Status, ExternalReference, MpesaReceiptNumber, ... } }
    const body = req.body?.response || req.body || {};
    const reference = body.ExternalReference || body.external_reference;
    const success = body.Status === 'Success' || body.status === 'SUCCESS' || body.ResultCode === 0;
    if (!reference) return res.status(200).json({ ok: true }); // ack anyway

    const { data: payment } = await supabaseAdmin
      .from('payments').select('*').eq('external_reference', reference).single();
    if (!payment) return res.status(200).json({ ok: true });

    if (success) {
      // Ignore repeats, and payments for less than what was asked.
      if (payment.status === 'success') return res.status(200).json({ ok: true });
      const paid = Number(body.Amount ?? body.amount ?? payment.amount);
      if (paid < Number(payment.amount)) {
        console.warn('[fedha] payhero callback: amount short', reference, paid, payment.amount);
        await supabaseAdmin.from('payments').update({ status: 'failed' }).eq('external_reference', reference);
        return res.status(200).json({ ok: true });
      }
      await supabaseAdmin.from('payments')
        .update({ status: 'success', provider_ref: body.MpesaReceiptNumber || null })
        .eq('external_reference', reference);

      // Extend from the current end date if they renew early, so paying
      // early never loses days.
      const { data: sub } = await supabaseAdmin.from('subscriptions').select('current_period_end,status').eq('user_id', payment.user_id).maybeSingle();
      const currentEnd = sub?.status === 'active' && sub.current_period_end ? new Date(sub.current_period_end) : null;
      const periodEnd = currentEnd && currentEnd > new Date() ? currentEnd : new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1); // 1-month Pro
      await supabaseAdmin.from('subscriptions').upsert({
        user_id: payment.user_id, plan: 'pro', status: 'active',
        current_period_end: periodEnd.toISOString(), updated_at: new Date().toISOString(),
      });
    } else {
      // A failed or cancelled prompt only fails that payment; it must not
      // switch off a subscription that's already paid for.
      await supabaseAdmin.from('payments').update({ status: 'failed' }).eq('external_reference', reference);
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[fedha] payhero callback error:', e.message);
    return res.status(200).json({ ok: true }); // always 200 so PayHero stops retrying
  }
}
