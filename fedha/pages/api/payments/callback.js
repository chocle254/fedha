import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
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
      await supabaseAdmin.from('payments')
        .update({ status: 'success', provider_ref: body.MpesaReceiptNumber || null })
        .eq('external_reference', reference);

      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1); // 1-month Pro
      await supabaseAdmin.from('subscriptions').upsert({
        user_id: payment.user_id, plan: 'pro', status: 'active',
        current_period_end: periodEnd.toISOString(), updated_at: new Date().toISOString(),
      });
    } else {
      await supabaseAdmin.from('payments').update({ status: 'failed' }).eq('external_reference', reference);
      await supabaseAdmin.from('subscriptions').update({ status: 'inactive' }).eq('user_id', payment.user_id);
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[fedha] payhero callback error:', e.message);
    return res.status(200).json({ ok: true }); // always 200 so PayHero stops retrying
  }
}
