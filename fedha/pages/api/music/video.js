import { requireUser } from '../../../lib/require-user';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { webSearch } from '../../../lib/web-search';

// Finds the YouTube upload for a song (official audio first, then the official video), so the Music Room can play
// the full track through YouTube's embeddable player. Checks the video allows embedding (YouTube oEmbed answers
// 401/403 when it doesn't). Results are remembered per track ('music_yt' setting), so each song is looked up once.
const KEY = 'music_yt';
const idsIn = (text) => [...String(text || '').matchAll(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/g)].map((m) => m[1]);

async function embeddable(id) {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = await requireUser(req, res);
  if (!user) return;
  const artist = String(req.query.artist || '').slice(0, 100);
  const title = String(req.query.title || '').replace(/\s*\((album version|explicit|clean|remaster(ed)?[^)]*)\)/gi, '').slice(0, 140);
  const key = String(req.query.key || `${artist}|${title}`).slice(0, 80);
  if (!artist || !title) return res.status(400).json({ error: 'artist and title required' });

  const { data } = await supabaseAdmin.from('settings').select('value').eq('user_id', user.id).eq('key', KEY).maybeSingle();
  const map = data?.value || {};
  if (map[key] !== undefined) return res.status(200).json({ id: map[key] || null, cached: true });

  let found = null;
  for (const q of [`${artist} ${title} official audio youtube`, `${artist} ${title} official video youtube`]) {
    try {
      const hits = await webSearch(q, { limit: 8 });
      const ids = [...new Set(hits.flatMap((h) => idsIn(`${h.url} ${h.snippet || ""} ${h.title || ""}`)))];
      for (const id of ids.slice(0, 5)) {
        const meta = await embeddable(id);
        const t = `${meta?.title || ''} ${meta?.author_name || ''}`.toLowerCase();
        const words = title.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
        if (meta && (words.length === 0 || words.some((w) => t.includes(w)))) { found = id; break; }
      }
    } catch { /* try the next query */ }
    if (found) break;
  }
  map[key] = found;
  const entries = Object.entries(map);
  const trimmed = Object.fromEntries(entries.slice(-4000));
  await supabaseAdmin.from('settings').upsert({ user_id: user.id, key: KEY, value: trimmed, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
  return res.status(200).json({ id: found });
}
