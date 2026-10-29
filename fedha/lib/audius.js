// Music Room catalogue: Audius (api.audius.co), a free, open music network: full-length tracks, no key needed,
// legal to stream, and its audio allows the browser to process it (so the bass modes work).
const API = 'https://api.audius.co/v1';
const APP = 'app_name=Luxe';

export const GENRES = [
  ['', '🔥 Trending'], ['Hip-Hop/Rap', 'Hip-Hop'], ['Trap', 'Trap'], ['Dubstep', 'Dubstep'], ['Afrobeats', 'Afrobeats'],
  ['amapiano', 'Amapiano', 'search'], ['R&B/Soul', 'R&B'], ['Deep House', 'Deep House'], ['Drum & Bass', 'Drum & Bass'],
  ['Electronic', 'Electronic'], ['Lo-Fi', 'Lo-Fi'], ['Ambient', 'Chill'],
];

const pick = (t) => ({
  id: t.id, title: t.title, artist: t.user?.name || 'Unknown', duration: t.duration || 0, genre: t.genre || '',
  art: t.artwork?.['480x480'] || t.artwork?.['150x150'] || t.artwork?.['1000x1000'] || null,
  artBig: t.artwork?.['1000x1000'] || t.artwork?.['480x480'] || null, plays: t.play_count || 0,
});

async function get(path) {
  const r = await fetch(`${API}${path}${path.includes('?') ? '&' : '?'}${APP}`);
  if (!r.ok) throw new Error(`Audius ${r.status}`);
  return (await r.json()).data || [];
}

export async function trending(genre = '', time = 'week') {
  const g = genre ? `&genre=${encodeURIComponent(genre)}` : '';
  return (await get(`/tracks/trending?time=${time}${g}&limit=40`)).filter((t) => t.is_streamable !== false).map(pick);
}
export async function search(q) {
  if (!q.trim()) return [];
  return (await get(`/tracks/search?query=${encodeURIComponent(q.trim())}&limit=40`)).filter((t) => t.is_streamable !== false).map(pick);
}
export const streamUrl = (id) => `${API}/tracks/${id}/stream?${APP}`;
