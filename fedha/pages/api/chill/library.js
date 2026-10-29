import { requireUser } from '../../../lib/require-user';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { userForToken } from '../../../lib/sms-capture';

// Chill Room library: the movie / episode files on your phone (names, sizes, lengths only; LibraryActivity in the
// Android app filters out personal videos before sending). Stored as one small setting, 'chill_library'.
//   POST (phone, x-device-token): { files: [{ id, name, size, duration, added, folder }] } replaces the list.
//   GET  (signed in): { files, scanned_at }.
export const config = { api: { bodyParser: { sizeLimit: '256kb' } } };
const KEY = 'chill_library';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'POST') {
    const who = await userForToken(String(req.headers['x-device-token'] || ''));
    if (!who) return res.status(401).json({ error: 'This phone is not linked.' });
    const files = (Array.isArray(req.body?.files) ? req.body.files : []).slice(0, 2000).map((f) => ({
      id: Number(f.id), name: String(f.name || '').slice(0, 200), size: Number(f.size) || 0,
      duration: Number(f.duration) || 0, added: Number(f.added) || 0, folder: String(f.folder || '').slice(0, 120),
    })).filter((f) => f.id && f.name);
    await supabaseAdmin.from('settings').upsert({ user_id: who.userId, key: KEY, value: { files, scanned_at: new Date().toISOString() }, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
    return res.status(200).json({ ok: true, count: files.length });
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requireUser(req, res);
  if (!user) return;
  const { data } = await supabaseAdmin.from('settings').select('value').eq('user_id', user.id).eq('key', KEY).maybeSingle();
  return res.status(200).json(data?.value || { files: [], scanned_at: null });
}
