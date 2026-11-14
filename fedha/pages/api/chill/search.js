import { requireUser } from '../../../lib/require-user';

// GET /api/chill/search?q=… : series (TVMaze) and movies (Apple) matching a title, with posters, so you can find
// something you watched elsewhere, mark it ❤️ Loved and get titles like it.
const strip = (h) => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 240);
const j = async (url) => { try { const r = await fetch(url); return r.ok ? r.json() : null; } catch { return null; } };
const ANIM = /animat|pixar|dreamworks|illumination/i;

export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  const q = String(req.query.q || '').trim().slice(0, 80);
  if (q.length < 2) return res.status(200).json({ items: [] });
  const [tv, it] = await Promise.all([
    j(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`),
    j(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=movie&limit=8`),
  ]);
  const shows = (tv || []).map((x) => x.show).filter((s) => s && ['Scripted', 'Animation'].includes(s.type)).slice(0, 8).map((s) => ({
    title: s.name, type: 'series', animation: s.type === 'Animation' || (s.genres || []).includes('Anime'),
    year: s.premiered ? Number(s.premiered.slice(0, 4)) : null, poster: s.image?.medium || null,
    genres: [...(s.genres || []), ...(s.type === 'Animation' ? ['Animation'] : [])], why: strip(s.summary), rating: s.rating?.average || null,
    where: s.webChannel?.name || s.network?.name || '',
  }));
  const movies = (it?.results || []).filter((m) => m.kind === 'feature-movie').slice(0, 6).map((m) => {
    const anim = m.primaryGenreName === 'Anime' || (m.primaryGenreName === 'Kids & Family' && ANIM.test(m.longDescription || ''));
    return {
      title: m.trackName, type: 'movie', animation: anim, year: m.releaseDate ? Number(m.releaseDate.slice(0, 4)) : null,
      poster: String(m.artworkUrl100 || '').replace(/\/\d+x\d+bb\.(png|jpg)$/, '/400x600bb.jpg') || null,
      genres: [m.primaryGenreName, anim ? 'Animation' : null].filter(Boolean), why: strip(m.longDescription),
    };
  });
  // Series first (that's mostly what you search for), then films.
  return res.status(200).json({ items: [...shows, ...movies] });
}
