import { requireUser } from '../../../lib/require-user';
import { nvidiaChat } from '../../../lib/nvidia-client';

// Reels candidates: titles worth a trailer, from three places (like Instagram mixing "for you" with "explore"):
//   taste    the AI picks series / movies close to what you have, finished, liked and the genres you watch through
//   trending series streaming right now (TVMaze, most-watched first)
//   new      Apple's current top movies
// Body: { have: [titles], liked: [titles], seen: [titles], no: [titles], genres: { Drama: 3.2, ... }, exclude: [titles] }
// The page ranks them (lib/reels.js) and fetches trailers 4 at a time.
const parseJSON = (t) => { const s = String(t || ''); const a = s.indexOf('{'); const b = s.lastIndexOf('}'); try { return a >= 0 ? JSON.parse(s.slice(a, b + 1)) : null; } catch { return null; } };

async function trending() {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const rows = await (await fetch(`https://api.tvmaze.com/schedule/web?date=${day}`, { signal: AbortSignal.timeout(8000) })).json();
    const seen = new Map();
    for (const ep of rows) { const s = ep._embedded?.show; if (s?.image && (s.language === 'English' || !s.language) && !seen.has(s.id)) seen.set(s.id, s); }
    return [...seen.values()].sort((a, b) => (b.weight || 0) - (a.weight || 0)).slice(0, 12).map((s) => ({ title: s.name, type: 'series', year: Number(String(s.premiered || '').slice(0, 4)) || null, genres: s.genres || [], poster: s.image?.original || s.image?.medium, src: 'trending', why: 'Trending now' }));
  } catch { return []; }
}
async function newMovies() {
  try {
    const d = await (await fetch('https://itunes.apple.com/us/rss/topmovies/limit=15/json', { signal: AbortSignal.timeout(8000) })).json();
    return (d.feed?.entry || []).map((e) => ({ title: e['im:name']?.label, type: 'movie', year: Number(String(e['im:releaseDate']?.label || '').slice(0, 4)) || null, genres: [e.category?.attributes?.label].filter(Boolean), poster: (e['im:image']?.at(-1)?.label || '').replace(/\/\d+x\d+bb\.png$/, '/600x900bb.jpg'), src: 'new', why: 'New this week' })).filter((x) => x.title);
  } catch { return []; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requireUser(req, res);
  if (!user) return;
  const b = req.body || {};
  const list = (k, n = 30) => (Array.isArray(b[k]) ? b[k] : []).map(String).slice(0, n);
  const genres = Object.entries(b.genres || {}).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([g]) => g);
  const exclude = new Set([...list('have', 80), ...list('seen', 80), ...list('no', 80), ...list('exclude', 200)].map((t) => t.toLowerCase()));

  const [ai, trend, fresh] = await Promise.all([
    (async () => {
      try {
        const prompt = `Pick 14 TV series and movies for a trailer feed (like Instagram Reels) for one viewer who loves gripping, binge-able stories watched in the evening.
In their library: ${list('have').join(', ') || 'nothing yet'}. Loved / want to watch: ${list('liked').join(', ') || 'none'}. Not interested: ${list('no').join(', ') || 'none'}.
Genres they watch trailers of all the way through: ${genres.join(', ') || 'unknown yet'}.
Mostly close to their taste, plus 3 bold picks from genres they haven't tried. Real, well-known titles only (recent ones welcome), exact titles. Never suggest: ${[...exclude].slice(0, 60).join(', ')}.
JSON only: {"items":[{"title":"...","type":"series"|"movie","year":2024,"genres":["Crime","Drama"],"why":"Because you like X / short reason (max 8 words)","explore":false}]}`;
        const j = parseJSON(await nvidiaChat({ prompt, system: 'You output only valid JSON. No markdown, no commentary.', temperature: 0.9, maxTokens: 1200 }));
        return (j?.items || []).map((x) => ({ title: String(x.title || '').slice(0, 80), type: x.type === 'movie' ? 'movie' : 'series', year: Number(x.year) || null, genres: Array.isArray(x.genres) ? x.genres.slice(0, 3).map(String) : [], why: String(x.why || '').slice(0, 60), src: x.explore ? 'explore' : 'taste' }));
      } catch { return []; }
    })(),
    trending(),
    newMovies(),
  ]);
  const items = [...ai, ...trend, ...fresh].filter((x) => x.title && !exclude.has(x.title.toLowerCase()));
  const uniq = [...new Map(items.map((x) => [x.title.toLowerCase(), x])).values()];
  return res.status(200).json({ items: uniq });
}
