import { requireUser } from '../../../lib/require-user';
import { nvidiaChat } from '../../../lib/nvidia-client';

// DJ Luxe (like Spotify's DJ X): plays a JOURNEY of moods, one chapter at a time (~12 songs each), e.g.
// heartbreak → healing → feel good → hype. Every chapter mixes eras: old school classics, recent songs, what's
// trending on TikTok and Instagram Reels right now, and songs from the listener's own artists, all fitting the mood.
// The player asks for the next chapter before the current one runs out, so the music never stops.
// Body: {
//   artists:  your top artists (likes + plays), e.g. ['Lil Wayne', 'Drake']
//   plays:    { artist: count }
//   recent:   track ids you just heard (not repeated)
//   mood:     the mood to start with (a Music Room mood button) or null
//   request:  free text ("2008 Weezy", "songs for a night drive") or null: the first chapter
//   switchUp: true = "switch it up": a new direction next to your taste
//   journey:  moods still to come (sent back by the player for the next chapter); empty = plan a new journey
//   chapter:  chapter number (1 = the start of the set)
//   prev:     the previous chapter's name and mood, for the handover line
//   hour:     the listener's local hour
// }
// Returns { name, mood, journey, intro, why, tracks } (tracks carry `dj` lines; track 1 of a later chapter carries
// the mood-change line).
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dayPart = (h) => (h < 5 ? 'late night' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night');
const VOICE = 'You are DJ Luxe, a smooth, confident radio DJ. Plain, natural English like a top US hip-hop radio host. No slang from any particular country, no "bro", no clichés about where the listener is from.';
const MOODS = ['heartbreak', 'healing', 'late night', 'chill', 'feel good', 'throwback', 'hype', 'party', 'gym', 'focus', 'love'];

// What's trending: Deezer's editor-run TikTok and Instagram Reels hit playlists plus the global chart.
// Kept warm per server instance for 3 hours.
const TRENDING = [[4403076402, 'TikTok'], [6951615084, 'TikTok'], [8848415502, 'Instagram Reels'], ['chart', 'charts']];
let trendCache = { at: 0, list: [] };
async function trending() {
  if (Date.now() - trendCache.at < 3 * 3600e3 && trendCache.list.length) return trendCache.list;
  const lists = await Promise.all(TRENDING.map(([id, from]) => j(id === 'chart' ? '/chart/0/tracks?limit=40' : `/playlist/${id}/tracks?limit=60`)
    .then((r) => (r.data || []).filter((t) => t.readable !== false).map((t) => ({ ...shape(t), from }))).catch(() => [])));
  const list = [...new Map(lists.flat().map((t) => [`${t.artist}|${t.title}`.toLowerCase(), t])).values()];
  if (list.length) trendCache = { at: Date.now(), list };
  return list;
}

// "Artist - Title" → a Deezer track by that artist (skipped if Deezer doesn't have it), 5 at a time to stay under Deezer's quota.
async function findSongs(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i += 5) {
    const part = lines.slice(i, i + 5);
    out.push(...await Promise.all(part.map(async (line) => {
      const [artist, ...rest] = String(line).split(' - ');
      const title = rest.join(' - ');
      const who = artist.trim().toLowerCase();
      try {
        const r = await j(`/search?q=${encodeURIComponent(title ? `${artist} ${title}` : String(line))}&limit=5`);
        const ok = (r.data || []).filter((x) => x.readable !== false);
        // The first hit by the right artist (the most popular hit can be a different song by someone else).
        const t = (title && ok.find((x) => (x.artist?.name || '').toLowerCase().includes(who) || who.includes((x.artist?.name || '').toLowerCase()))) || (title ? null : ok[0]);
        return t ? shape(t) : null;
      } catch { return null; }
    })));
    if (i + 5 < lines.length) await wait(250);
  }
  return out.filter(Boolean);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requireUser(req, res);
  if (!user) return;
  const b = req.body || {};
  const names = (Array.isArray(b.artists) ? b.artists : []).map(String).filter(Boolean).slice(0, 6);
  if (!names.length) names.push('Lil Wayne');
  const recent = new Set((b.recent || []).map(String));
  const request = b.request ? String(b.request).slice(0, 160) : null;
  const hour = Number.isFinite(Number(b.hour)) ? Number(b.hour) : 20;
  const chapterNo = Math.max(1, Number(b.chapter) || 1);
  const journey = (Array.isArray(b.journey) ? b.journey : []).map(String).filter(Boolean).slice(0, 6);
  const prev = b.prev && typeof b.prev === 'object' ? { name: String(b.prev.name || '').slice(0, 60), mood: String(b.prev.mood || '').slice(0, 30) } : null;
  // This chapter's mood: the button you pressed, else the next stop on the journey, else the AI picks.
  const mood = b.mood ? String(b.mood).slice(0, 30) : chapterNo > 1 && journey.length ? journey[0] : null;
  const ahead = chapterNo > 1 && journey.length ? journey.slice(1) : [];
  const plays = b.plays && typeof b.plays === 'object' ? b.plays : {};
  const favourite = Object.entries(plays).sort((x, y) => y[1] - x[1])[0];

  try {
    const hot = shuffle(await trending()).slice(0, 70);

    // 1. The plan for this chapter: which trending songs fit, plus classics, recent songs and their own artists.
    const plan = await ask(`${VOICE}
Listener's taste (most played first): ${names.join(', ')}.
Time: ${dayPart(hour)}. Chapter ${chapterNo} of a DJ set that moves through moods like a story.
${request && chapterNo === 1 ? `This chapter is their request: "${request}".` : mood ? `This chapter's mood: ${mood}.` : b.switchUp ? 'They pressed "switch it up": pick a mood and a fresh direction NEXT to their taste.' : 'Pick the opening mood that suits the time of day and their taste.'}
${prev ? `The previous chapter was "${prev.name}" (${prev.mood}).` : ''}
Trending right now on TikTok, Instagram Reels and the charts (numbered):
${hot.map((t, i) => `${i}. ${t.artist} - ${t.title}`).join('\n')}

Build ~13 songs of GREAT, well-known music for this mood, mixing eras. Return JSON only:
{"mood":"one of ${MOODS.join(', ')}${request ? ', or a short word for the request' : ''}",
"name":"short chapter name like a Spotify daylist, e.g. 'heartbroken 2000s R&B'",
"trending":[numbers from the trending list that truly fit this mood, 3-5],
"classics":["Artist - Title", 4-5 big old-school hits (before 2012) that fit the mood, real songs only],
"recent":["Artist - Title", 3-4 hits from 2018 onwards that fit the mood, real songs only],
"theirs":["Artist - Title", 3-4 songs by their artists (${names.slice(0, 4).join(', ')}) that fit the mood, real songs only],
${ahead.length || chapterNo > 1 ? '' : `"next":["3-4 moods from: ${MOODS.join(', ')}, the journey after this chapter, changing step by step (e.g. heartbreak, healing, feel good, hype), never jumping straight from sad to party"],`}
"why":"one sentence the DJ says about this chapter${favourite ? ` (may mention their most played artist ${favourite[0]})` : ''}"}`, 900, 0.85).catch(() => null);

    const chapterMood = String(plan?.mood || mood || 'feel good').slice(0, 30);
    const picksTrend = (Array.isArray(plan?.trending) ? plan.trending : []).map(Number).filter((n) => hot[n]).slice(0, 5).map((n) => hot[n]);
    const [classics, fresh, theirs] = await Promise.all([
      findSongs((plan?.classics || []).slice(0, 5)),
      findSongs((plan?.recent || []).slice(0, 4)),
      findSongs((plan?.theirs || []).slice(0, 4)),
    ]);
    // Nothing from the plan (AI down): their artists' top songs and the trending list.
    let backup = [];
    if (classics.length + fresh.length + theirs.length < 5) {
      const a = await j(`/search/artist?q=${encodeURIComponent(names[0])}&limit=3`).then((r) => r.data?.[0]).catch(() => null);
      if (a) backup = await j(`/artist/${a.id}/top?limit=15`).then((r) => (r.data || []).map(shape)).catch(() => []);
    }

    // 2. Mix the eras like a radio show: a classic, something trending, one of theirs, something recent, repeat.
    const notHeard = (l) => shuffle(l.filter((t) => !recent.has(t.id)));
    const buckets = [notHeard(classics), notHeard(picksTrend.length ? picksTrend : hot.slice(0, 4)), notHeard([...theirs, ...backup]), notHeard(fresh)];
    const set = []; const seen = new Set();
    const key = (t) => `${t.artist}|${t.title}`.toLowerCase();
    for (let round = 0; set.length < 13 && buckets.some((x) => x.length); round++) {
      for (const bucket of buckets) {
        const i = bucket.findIndex((t) => !seen.has(key(t)) && t.artist !== set[set.length - 1]?.artist);
        if (i < 0) continue;
        const [t] = bucket.splice(i, 1); seen.add(key(t)); set.push(t);
        if (set.length >= 13) break;
      }
      if (round > 20) break;
    }
    const tracks = set;
    if (!tracks.length) return res.status(200).json({ error: 'DJ Luxe could not find songs for that. Try another mood.' });

    const nextJourney = ahead.length ? ahead : (Array.isArray(plan?.next) ? plan.next.map(String).filter(Boolean).slice(0, 4) : []);
    const name = plan?.name ? String(plan.name).slice(0, 60) : request && chapterNo === 1 ? request : `${chapterMood} mix`;

    // 3. The voice: an intro (or the mood-change line) and handovers through the chapter.
    const lines = await ask(`${VOICE}
${prev ? `We're moving from "${prev.name}" (${prev.mood}) into a new chapter: "${name}" (${chapterMood}).` : `Opening the set with "${name}" (${chapterMood}), ${dayPart(hour)}.`}
Why it fits: ${plan?.why || '—'}
Songs in order:
${tracks.map((t, i) => `${i + 1}. ${t.artist} - ${t.title}`).join('\n')}
Write: "intro" (max 30 words: ${prev ? 'turn the mood, say where we are going now and tease song 1' : `a ${dayPart(hour)} greeting, say what this set is and that it moves through moods, tease song 1`}), and short handovers for songs 4, 8, 11 (max 18 words each, from the previous song into that one). Only use names and titles above; never invent facts, years, features or stories. JSON only: {"intro":"...","lines":{"4":"...","8":"...","11":"..."}}`, 500, 0.9).catch(() => null);
    const intro = lines?.intro ? String(lines.intro).slice(0, 240) : prev ? `Switching the mood now. This is ${name}.` : `DJ Luxe here. ${plan?.why || ''} Starting with ${tracks[0].artist}.`;
    const withLines = tracks.map((t, i) => ({
      ...t,
      dj: i === 0 && prev ? intro : lines?.lines?.[String(i + 1)] ? String(lines.lines[String(i + 1)]).slice(0, 180) : null,
      chapter: chapterNo,
    }));
    return res.status(200).json({ name, mood: chapterMood, journey: nextJourney, chapter: chapterNo, intro, why: plan?.why || null, tracks: withLines });
  } catch {
    return res.status(502).json({ error: 'DJ Luxe could not reach the music catalogue. Try again in a minute.' });
  }
}
