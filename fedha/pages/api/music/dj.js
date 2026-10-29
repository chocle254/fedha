import { requireUser } from '../../../lib/require-user';
import { nvidiaChat } from '../../../lib/nvidia-client';

// DJ Luxe: builds a set like a radio DJ.
//   seeds: the artists you love (likes + what you play most), e.g. Lil Wayne
//   set:   ~18 songs: your artists' biggest tracks, their circle (similar artists on Deezer), and the artist radio,
//          spread so the same artist never plays twice in a row, bangers up front, a breather in the middle
//   voice: short host lines (AI writes them; the phone reads them out over the music between songs)
// Body: { artists: ['Lil Wayne', ...], recent: ['dz:123', ...], mood: 'hype' | 'chill' | null }
const DZ = 'https://api.deezer.com';
const j = async (path) => { const r = await fetch(`${DZ}${path}`, { signal: AbortSignal.timeout(9000) }); return r.json(); };
const shape = (t) => ({
  id: `dz:${t.id}`, dz: t.id, source: 'yt', title: t.title_short || t.title, artist: t.artist?.name || '', artistId: t.artist?.id || null,
  art: t.album?.cover_medium || null, artBig: t.album?.cover_xl || t.album?.cover_big || null, duration: t.duration || 0,
  gain: typeof t.gain === 'number' ? t.gain : null, rank: t.rank || 0,
});
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [b[i], b[k]] = [b[k], b[i]]; } return b; };

async function artistByName(name) {
  const r = await j(`/search/artist?q=${encodeURIComponent(name)}&limit=5`);
  return (r.data || []).sort((a, b) => (b.nb_fan || 0) - (a.nb_fan || 0))[0] || null;
}

function parseJSON(t) { const s = String(t || ''); const a = s.indexOf('{'); const b = s.lastIndexOf('}'); try { return a >= 0 ? JSON.parse(s.slice(a, b + 1)) : null; } catch { return null; } }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requireUser(req, res);
  if (!user) return;
  const names = (Array.isArray(req.body?.artists) ? req.body.artists : []).map(String).filter(Boolean).slice(0, 5);
  const recent = new Set((req.body?.recent || []).map(String));
  const mood = req.body?.mood || null;
  if (!names.length) names.push('Lil Wayne');

  try {
    const seeds = (await Promise.all(names.map(artistByName))).filter(Boolean);
    const main = seeds[0];
    const [tops, rel, radio] = await Promise.all([
      Promise.all(seeds.map((a) => j(`/artist/${a.id}/top?limit=20`).then((r) => (r.data || []).map(shape)))),
      j(`/artist/${main.id}/related?limit=10`).then((r) => r.data || []),
      j(`/artist/${main.id}/radio?limit=30`).then((r) => (r.data || []).map(shape)),
    ]);
    const circle = await Promise.all(shuffle(rel).slice(0, 6).map((a) => j(`/artist/${a.id}/top?limit=6`).then((r) => (r.data || []).map(shape))));

    // ~45% your artists, ~35% their circle, ~20% radio; skip what you just heard.
    const fresh = (list) => list.filter((t) => !recent.has(t.id));
    const mine = tops.flatMap((list) => shuffle(fresh(list).slice(0, 14)).slice(0, Math.ceil(9 / seeds.length) + 1));
    const theirs = shuffle(fresh(circle.flat())).slice(0, 7);
    const air = shuffle(fresh(radio)).slice(0, 4);
    let pool = [...new Map([...mine, ...theirs, ...air].map((t) => [t.id, t])).values()];

    // Order: two big ones to open, then alternate; never the same artist back to back.
    pool.sort((a, b) => b.rank - a.rank);
    const opener = pool.splice(0, 2);
    pool = shuffle(pool);
    if (mood === 'chill') pool.sort((a, b) => a.rank - b.rank);
    const set = [...opener];
    while (pool.length) {
      const i = pool.findIndex((t) => t.artist !== set[set.length - 1]?.artist);
      set.push(...pool.splice(i >= 0 ? i : 0, 1));
    }
    const tracks = set.slice(0, 18);

    // Host lines: short, hype, no made-up facts.
    let intro = null; let lines = {};
    try {
      const prompt = `You are DJ Luxe, a smooth, confident late-night radio DJ for one listener who loves ${names.join(', ')}. Plain, natural English like a top US hip-hop radio host: no slang from any particular country, no "bro", no clichés about where the listener is from.
The set, in order:
${tracks.map((t, i) => `${i + 1}. ${t.artist} - ${t.title}`).join('\n')}
Write: one intro line (max 22 words) welcoming them and teasing the first song; and a line for songs 3, 6, 9, 12 and 15 (max 16 words each) that hands over from the previous song to that one. Only use the artist names and song titles given: do NOT invent facts, years, features or stories. Return JSON only: {"intro":"...","lines":{"3":"...","6":"...","9":"...","12":"...","15":"..."}}`;
      const out = parseJSON(await nvidiaChat({ prompt, system: 'You output only valid JSON. No markdown, no commentary.', temperature: 0.9, maxTokens: 600 }));
      intro = out?.intro ? String(out.intro).slice(0, 200) : null;
      lines = out?.lines && typeof out.lines === 'object' ? out.lines : {};
    } catch { /* the set works without a voice */ }
    const withLines = tracks.map((t, i) => ({ ...t, dj: lines[String(i + 1)] ? String(lines[String(i + 1)]).slice(0, 160) : null }));
    return res.status(200).json({ intro: intro || `DJ Luxe in the building. ${tracks[0] ? `Let's start with ${tracks[0].artist}.` : ''}`, tracks: withLines, seeds: seeds.map((a) => a.name) });
  } catch (e) {
    return res.status(502).json({ error: 'DJ Luxe could not reach the music catalogue. Try again in a minute.' });
  }
}
