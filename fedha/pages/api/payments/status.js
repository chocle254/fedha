import { supabaseAdmin } from '../../../lib/supabaseAdmin';

// GET /api/payments/status?reference=… — lets the signed-in user poll their
// own payment after the M-Pesa prompt. (This file used to be empty.)
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const accessToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!accessToken) return res.status(401).json({ error: 'Sign in first' });
  const { data: authData, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !authData?.user) return res.status(401).json({ error: 'Sign in first' });

  const reference = String(req.query.reference || '');
  if (!reference) return res.status(400).json({ error: 'reference is required' });
  const { data: payment } = await supabaseAdmin
    .from('payments').select('status,amount,provider_ref')
    .eq('external_reference', reference).eq('user_id', authData.user.id).maybeSingle();
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  return res.status(200).json(payment);
}
