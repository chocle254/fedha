import { requireUser } from '../../../lib/require-user';
import { nvidiaChat } from '../../../lib/nvidia-client';

// Chill Room → the parts of a movie (Part 1 to 3 of a film series). The AI lists the official films in the series
// in release order; each one is checked against Apple's film catalogue (and gets its poster from there), so a part
// that doesn't exist is dropped. A stand-alone film returns { parts: [] }.
// Query: ?title=The Godfather&year=1972
const parseJSON = (t) => { const s = String(t || ''); const a = s.indexOf('{'); const b = s.lastIndexOf('}'); try { return a >= 0 ? JSON.parse(s.slice(a, b + 1)) : null; } catch { return null; } };
const norm = (t) => String(t || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim().replace(/^the /, '');

async function apple(title, year) {
  try {
    const d = await (await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(title)}&entity=movie&limit=10`, { signal: AbortSignal.timeout(8000) })).json();
    const hits = (d.results || []).filter((r) => norm(r.trackName).startsWith(norm(title).slice(0, 12)));
    const m = hits.find((r) => year && String(r.releaseDate || '').startsWith(String(year))) || hits.find((r) => norm(r.trackName) === norm(title)) || hits[0];
    return m ? { poster: String(m.artworkUrl100 || '').replace(/\/\d+x\d+bb\.(jpg|png)$/, '/400x600bb.jpg'), year: Number(String(m.releaseDate || '').slice(0, 4)) || year } : null;
  } catch { return null; }
}

export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  const title = String(req.query.title || '').slice(0, 100);
  const year = Number(req.query.year) || null;
  if (!title) return res.status(400).json({ error: 'title needed' });
  try {
    const prompt = `Is the film "${title}"${year ? ` (${year})` : ''} part of an official film series (sequels / prequels with the same story or characters)?
If yes, list every theatrical film in that series in release order, with the exact official title and release year. If it is a stand-alone film, return an empty list. Never invent films; leave out announced or unreleased ones and TV specials.
JSON only: {"series":"name of the series or null","parts":[{"title":"...","year":1972}]}`;
    const j = parseJSON(await nvidiaChat({ prompt, system: 'You output only valid JSON. No markdown, no commentary.', temperature: 0.1, maxTokens: 600 }));
    const list = (Array.isArray(j?.parts) ? j.parts : []).slice(0, 12).map((p) => ({ title: String(p.title || '').slice(0, 100), year: Number(p.year) || null })).filter((p) => p.title);
    if (list.length < 2) return res.status(200).json({ series: null, parts: [] });
    const checked = await Promise.all(list.map(async (p) => { const a = await apple(p.title, p.year); return a ? { ...p, ...a } : null; }));
    const parts = checked.filter(Boolean).sort((a, b) => (a.year || 0) - (b.year || 0));
    res.setHeader('Cache-Control', 's-maxage=604800');
    return res.status(200).json({ series: parts.length >= 2 ? String(j.series || '').slice(0, 80) || null : null, parts: parts.length >= 2 ? parts : [] });
  } catch {
    return res.status(200).json({ series: null, parts: [], error: 'busy' });
  }
}
