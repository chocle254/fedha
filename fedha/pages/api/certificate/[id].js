// Public certificate verification endpoint. Deliberately has NO auth check —
// that's the point of a "Verify Now" link: anyone with it can confirm the
// certificate is real. It never touches the anon client (which is subject
// to RLS and would just see nothing), and it only ever returns the handful
// of fields that are safe to publish — never your full account data.
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Missing certificate id' });

  if (!supabaseUrl || !serviceKey) {
    return res.status(503).json({ error: 'Verification is not configured on this deployment yet.' });
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Hackathon-derived certificates use the "hack_<id>" pattern from the app.
  if (id.startsWith('hack_')) {
    const hackId = id.slice(5);
    const { data, error } = await admin.from('hackathons').select('*').eq('id', hackId).maybeSingle();
    if (error || !data || !data.data?.certificate_image) return res.status(404).json({ error: 'Certificate not found' });
    const h = data.data;
    return res.status(200).json({
      id,
      title: h.name,
      organization: h.organizer || 'Hackathon',
      achievement: h.results_place || 'Winner',
      category: 'Hackathon',
      date_earned: h.results_date || h.deadline || data.created_at,
      description: h.project_name ? `Awarded for ${h.name}, presenting "${h.project_name}".` : `Awarded for participation in ${h.name}.`,
      image: h.certificate_image || null,
      recipient_name: 'Chocle254',
      verified: true,
    });
  }

  const { data, error } = await admin.from('certificates').select('*').eq('id', id).maybeSingle();
  if (error || !data) return res.status(404).json({ error: 'Certificate not found' });

  const c = data.data || {};
  return res.status(200).json({
    id: data.id,
    title: c.title,
    organization: c.organization,
    achievement: c.achievement,
    category: c.category,
    date_earned: data.date_earned || c.date_earned,
    description: c.description || null,
    image: c.image || null,
    recipient_name: c.recipient_name || 'Chocle254',
    verified: true,
  });
}
