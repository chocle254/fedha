import { requireUser } from '../../../lib/require-user';
import { nvidiaChat } from '../../../lib/nvidia-client';

// GET /api/chill/similar?title=…&type=series|movie&year=… : 12 titles like this one (the AI picks them, then each
// gets its poster and genres from TVMaze / Apple). Same answer for anyone, so the phone keeps it (lib/chill.js);
// your taste re-orders it there. Nothing is stored on the server.
const j = async (url) => { try { const r = await fetch(url); return r.ok ? r.json() : null; } catch { return null; } };
function parseJSON(text) {
  const s = String(text || ''); const a = s.indexOf('{'); const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}
async function look(x) {
  if (x.type === 'movie') {
    const d = await j(`https://itunes.apple.com/search?term=${encodeURIComponent(x.title)}&entity=movie&limit=5`);
    const hits = d?.results || [];
    const m = hits.find((r) => x.year && String(r.releaseDate || '').startsWith(String(x.year))) || hits[0];
    return m ? { poster: String(m.artworkUrl100 || '').replace(/\/\d+x\d+bb\.(png|jpg)$/, '/400x600bb.jpg'), genres: [m.primaryGenreName, x.animation ? 'Animation' : null].filter(Boolean) } : {};
  }
  const s = await j(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(x.title)}`);
  return s ? { poster: s.image?.medium || null, genres: [...(s.genres || []), ...(s.type === 'Animation' ? ['Animation'] : [])], rating: s.rating?.average || null, where: s.webChannel?.name || s.network?.name || '' } : {};
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = await requireUser(req, res);
  if (!user) return;
  const title = String(req.query.title || '').trim().slice(0, 100);
  const type = req.query.type === 'movie' ? 'movie' : 'series';
  const year = Number(req.query.year) || '';
  if (!title) return res.status(400).json({ items: [] });
  const prompt = `Someone loved the ${type} "${title}"${year ? ` (${year})` : ''}. Suggest 12 titles they would love for the same reasons: same feel, tone, pace and kind of story (not just the same genre label). Mostly ${type === 'movie' ? 'movies' : 'series'}, a couple of the other kind is fine. Real titles only, exact official title and first-release year, best match first. If "${title}" is animated or anime, lean animated too.
Return JSON only: {"items":[{"title":"...","type":"series"|"movie","animation":false,"year":2008,"why":"one short sentence on what it shares with ${title}, no spoilers"}]}`;
  try {
    const out = await nvidiaChat({ prompt, system: 'You output only valid JSON. No markdown, no commentary.', temperature: 0.5, maxTokens: 1500 });
    const want = (parseJSON(out)?.items || []).filter((x) => x?.title && String(x.title).toLowerCase() !== title.toLowerCase()).slice(0, 12)
      .map((x) => ({ title: String(x.title).slice(0, 80), type: x.type === 'movie' ? 'movie' : 'series', animation: !!x.animation, year: Number(x.year) || null, why: String(x.why || '').slice(0, 200), because: title }));
    const items = await Promise.all(want.map(async (x) => ({ ...x, ...(await look(x)) })));
    return res.status(200).json({ title, items });
  } catch {
    return res.status(200).json({ title, items: [], error: 'The AI is busy right now. Try again in a minute.' });
  }
}
