import { requireUser } from '../../../lib/require-user';
import { nvidiaChat } from '../../../lib/nvidia-client';

// DJ Luxe (like Spotify's DJ X): builds a set for a mood or a request, from your taste, and talks between songs.
// Body: {
//   artists:  your top artists (likes + plays), e.g. ['Lil Wayne', 'Drake']
//   plays:    { artist: count } (so the DJ can say why it picked things)
//   recent:   track ids you just heard (not repeated)
//   mood:     'hype' | 'late night' | 'gym' | 'chill' | 'throwback' | 'party' | 'heartbreak' | 'focus' | null
//   request:  free text ("2008 Weezy", "songs for a night drive") or null
//   switchUp: true = "switch it up": a new direction next to your taste
//   hour:     the listener's local hour (for the greeting / daylist feel)
// }
// 1. The AI turns taste + mood/request into a plan: which of your artists fit, Deezer searches to run, the order.
// 2. Songs come from Deezer: your artists' top tracks, their circle, artist radio and the plan's searches.
// 3. The AI writes the host lines from the final list only (no invented facts), plain radio-host English.
const DZ = 'https://api.deezer.com';
const j = async (path) => { const r = await fetch(`${DZ}${path}`, { signal: AbortSignal.timeout(9000) }); return r.json(); };
const shape = (t) => ({
  id: `dz:${t.id}`, dz: t.id, source: 'yt', title: t.title_short || t.title, artist: t.artist?.name || '', artistId: t.artist?.id || null,
  art: t.album?.cover_medium || null, artBig: t.album?.cover_xl || t.album?.cover_big || null, duration: t.duration || 0,
  gain: typeof t.gain === 'number' ? t.gain : null, rank: t.rank || 0,
});
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [b[i], b[k]] = [b[k], b[i]]; } return b; };
const parseJSON = (t) => { const s = String(t || ''); const a = s.indexOf('{'); const b = s.lastIndexOf('}'); try { return a >= 0 ? JSON.parse(s.slice(a, b + 1)) : null; } catch { return null; } };
const ask = async (prompt, maxTokens = 700, temperature = 0.8) => parseJSON(await nvidiaChat({ prompt, system: 'You output only valid JSON. No markdown, no commentary.', temperature, maxTokens }));

async function artistByName(name) {
  const r = await j(`/search/artist?q=${encodeURIComponent(name)}&limit=5`);
  return (r.data || []).sort((a, b) => (b.nb_fan || 0) - (a.nb_fan || 0))[0] || null;
}
const dayPart = (h) => (h < 5 ? 'late night' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night');
const VOICE = 'You are DJ Luxe, a smooth, confident radio DJ. Plain, natural English like a top US hip-hop radio host. No slang from any particular country, no "bro", no clichés about where the listener is from.';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requireUser(req, res);
  if (!user) return;
  const b = req.body || {};
  const names = (Array.isArray(b.artists) ? b.artists : []).map(String).filter(Boolean).slice(0, 6);
  if (!names.length) names.push('Lil Wayne');
  const recent = new Set((b.recent || []).map(String));
  const mood = b.mood ? String(b.mood).slice(0, 30) : null;
  const request = b.request ? String(b.request).slice(0, 160) : null;
  const hour = Number.isFinite(Number(b.hour)) ? Number(b.hour) : 20;
  const plays = b.plays && typeof b.plays === 'object' ? b.plays : {};
  const favourite = Object.entries(plays).sort((x, y) => y[1] - x[1])[0];

  try {
    // 1. The plan.
    const plan = await ask(`${VOICE}
Listener's taste (most played first): ${names.join(', ')}.
Time: ${dayPart(hour)}.
${request ? `They asked for: "${request}".` : mood ? `Mood: ${mood}.` : b.switchUp ? 'They pressed "switch it up": pick a fresh direction that is NEXT to their taste (a neighbouring sub-genre, era or scene), not the same artists.' : 'No request: a set of their favourites and the artists around them.'}
Plan a ~18 song set. Return JSON only:
{"name":"short set name like a Spotify daylist, e.g. 'late night Weezy bounce'","keep":["artists from their taste that fit, 0-4"],"searches":["3-6 Deezer search queries that find real songs for this (artist names, song titles, genre + era words like 'Lil Wayne 2008' or 'trap workout')"],"energy":"rising|steady|winding down","why":"one sentence the DJ says about why this set fits them (may mention their most played artist ${favourite ? favourite[0] : ''})"}`, 500, 0.8).catch(() => null);

    const keep = (plan?.keep?.length ? plan.keep : request || b.switchUp ? [] : names).slice(0, 4);
    const searches = (plan?.searches || []).map(String).slice(0, 6);
    const seeds = (await Promise.all((keep.length ? keep : names.slice(0, 2)).map(artistByName))).filter(Boolean);
    const main = seeds[0];

    const [tops, rel, radio, found] = await Promise.all([
      Promise.all(seeds.map((a) => j(`/artist/${a.id}/top?limit=20`).then((r) => (r.data || []).map(shape)))),
      main && !request ? j(`/artist/${main.id}/related?limit=10`).then((r) => r.data || []) : Promise.resolve([]),
      main && !request && !b.switchUp ? j(`/artist/${main.id}/radio?limit=30`).then((r) => (r.data || []).map(shape)) : Promise.resolve([]),
      Promise.all(searches.map((q) => j(`/search?q=${encodeURIComponent(q)}&limit=15`).then((r) => (r.data || []).filter((t) => t.readable !== false).map(shape)).catch(() => []))),
    ]);
    const circle = await Promise.all(shuffle(rel).slice(0, 5).map((a) => j(`/artist/${a.id}/top?limit=6`).then((r) => (r.data || []).map(shape))));

    // Request / mood / switch-up: mostly what the plan searched for. Plain favourites: mostly your artists.
    const fresh = (list) => list.filter((t) => !recent.has(t.id));
    const fromSearch = shuffle(fresh(found.flat())).slice(0, request || mood || b.switchUp ? 12 : 4);
    const mine = tops.flatMap((list) => shuffle(fresh(list).slice(0, 14)).slice(0, Math.ceil((request || b.switchUp ? 5 : 9) / Math.max(1, seeds.length)) + 1));
    const theirs = shuffle(fresh(circle.flat())).slice(0, 6);
    const air = shuffle(fresh(radio)).slice(0, 3);
    let pool = [...new Map([...fromSearch, ...mine, ...theirs, ...air].map((t) => [t.id, t])).values()];
    // One song per title (Deezer has duplicates from compilations).
    pool = [...new Map(pool.map((t) => [`${t.artist}|${t.title}`.toLowerCase(), t])).values()];

    // Energy: rising = build up, winding down = start big then calmer, steady = big ones spread out.
    pool.sort((x, y) => y.rank - x.rank);
    const energy = plan?.energy || (mood === 'chill' || mood === 'focus' ? 'winding down' : 'steady');
    let ordered;
    if (energy === 'rising') ordered = [...pool].reverse();
    else if (energy === 'winding down') ordered = pool;
    else { const top = pool.splice(0, 2); ordered = [...top, ...shuffle(pool)]; }
    const set = [];
    while (ordered.length) {
      const i = ordered.findIndex((t) => t.artist !== set[set.length - 1]?.artist);
      set.push(...ordered.splice(i >= 0 ? i : 0, 1));
    }
    const tracks = set.slice(0, 18);
    if (!tracks.length) return res.status(200).json({ error: 'DJ Luxe could not find songs for that. Try another mood.' });

    // 3. The voice.
    const lines = await ask(`${VOICE}
Set "${plan?.name || 'your mix'}"${request ? `, for the request "${request}"` : mood ? `, mood ${mood}` : ''}, ${dayPart(hour)}.
Why it fits them: ${plan?.why || '—'}
Songs in order:
${tracks.map((t, i) => `${i + 1}. ${t.artist} - ${t.title}`).join('\n')}
Write: "intro" (max 28 words: a ${dayPart(hour)} greeting, say what this set is and why it fits them, tease song 1), and short handovers for songs 3, 6, 9, 12, 15 (max 18 words each, from the previous song into that one). Only use names and titles above; never invent facts, years, features or stories. JSON only: {"intro":"...","lines":{"3":"...","6":"...","9":"...","12":"...","15":"..."}}`, 600, 0.9).catch(() => null);
    const withLines = tracks.map((t, i) => ({ ...t, dj: lines?.lines?.[String(i + 1)] ? String(lines.lines[String(i + 1)]).slice(0, 180) : null }));
    return res.status(200).json({
      name: plan?.name ? String(plan.name).slice(0, 60) : request ? request : mood ? `${mood} mix` : 'Your mix',
      intro: lines?.intro ? String(lines.intro).slice(0, 240) : `DJ Luxe here. ${plan?.why || ''} Starting with ${tracks[0].artist}.`,
      why: plan?.why || null, tracks: withLines,
    });
  } catch {
    return res.status(502).json({ error: 'DJ Luxe could not reach the music catalogue. Try again in a minute.' });
  }
}
