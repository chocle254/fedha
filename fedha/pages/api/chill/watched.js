import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { userForToken } from '../../../lib/sms-capture';

// Luxe's own player (Android PlayerActivity) reports an episode / movie as watched (85% in, or the credits),
// and, every 30 s while you watch, where you are (for Continue Watching, setting 'chill_progress').
// Kept as its own setting, 'chill_watched' { "<show>|S04E11": ts, "movie:<title>": ts }, which the Chill Room
// merges with what you played from the page (so the app's offline copy of 'chill_room' is never overwritten).
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const who = await userForToken(String(req.headers['x-device-token'] || ''));
  if (!who) return res.status(401).json({ error: 'This phone is not linked.' });
  const key = String(req.body?.key || '').slice(0, 160);
  if (!key) return res.status(400).json({ error: 'key required' });

  // Progress while watching: { key, id, pos, dur } (seconds) -> 'chill_progress' for "Continue Watching".
  if (req.body?.progress) {
    const pos = Number(req.body.pos) || 0; const dur = Number(req.body.dur) || 0;
    const { data: cur } = await supabaseAdmin.from('settings').select('value').eq('user_id', who.userId).eq('key', 'chill_progress').maybeSingle();
    const all = { ...(cur?.value || {}) };
    if (dur > 0 && (dur - pos < 90 || pos / dur > 0.95)) delete all[key]; // finished
    else all[key] = { id: Number(req.body.id) || null, pos, dur, at: Date.now() };
    const trimmed = Object.fromEntries(Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, 60));
    await supabaseAdmin.from('settings').upsert({ user_id: who.userId, key: 'chill_progress', value: trimmed, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
    return res.status(200).json({ ok: true });
  }
  const { data } = await supabaseAdmin.from('settings').select('value').eq('user_id', who.userId).eq('key', 'chill_watched').maybeSingle();
  const value = { ...(data?.value || {}), [key]: Date.now() };
  await supabaseAdmin.from('settings').upsert({ user_id: who.userId, key: 'chill_watched', value, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
  return res.status(200).json({ ok: true });
}
