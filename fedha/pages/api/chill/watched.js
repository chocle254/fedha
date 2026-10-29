import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { userForToken } from '../../../lib/sms-capture';

// Luxe's own player (Android PlayerActivity) reports an episode / movie as watched (85% in, or the credits).
// Kept as its own setting, 'chill_watched' { "<show>|S04E11": ts, "movie:<title>": ts }, which the Chill Room
// merges with what you played from the page (so the app's offline copy of 'chill_room' is never overwritten).
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const who = await userForToken(String(req.headers['x-device-token'] || ''));
  if (!who) return res.status(401).json({ error: 'This phone is not linked.' });
  const key = String(req.body?.key || '').slice(0, 160);
  if (!key) return res.status(400).json({ error: 'key required' });
  const { data } = await supabaseAdmin.from('settings').select('value').eq('user_id', who.userId).eq('key', 'chill_watched').maybeSingle();
  const value = { ...(data?.value || {}), [key]: Date.now() };
  await supabaseAdmin.from('settings').upsert({ user_id: who.userId, key: 'chill_watched', value, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
  return res.status(200).json({ ok: true });
}
