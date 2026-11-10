// For You: one list blended from what the big platforms push and what YOU play.
//   Platforms (pages/api/music/charts.js): YouTube top songs in Kenya, Apple Music top songs in Kenya, Spotify's
//   daily charts (global and Nigeria). A song hot on two or three of them scores higher (they agree).
//   You: your artists' radios and their circle (Deezer, like Spotify's radio), weighted by likes (×2) and plays;
//   artists you keep skipping sink, songs you played in the last 2 days wait their turn, max 2 songs per artist.
//   Time of day: the artists you play at THIS time of day (morning, afternoon, evening, night) count extra and
//   seed the radios, so mornings and midnights get different lists. A song you skipped early twice is left out.
// discover(): one song each from artists close to yours that you have NEVER played (like Discover Weekly).
import { findArtist, artistRadio, related, artistTop } from './popular';

let chartsP = null;
export function fetchCharts() {
  if (!chartsP) chartsP = fetch('/api/music/charts').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  return chartsP;
}

// Morning / afternoon / evening / night, by the phone's clock.
export function daypartNow(d = new Date()) { const h = d.getHours(); return h >= 5 && h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 22 ? 'evening' : 'night'; }
export const songKey = (t) => keyOf(t);

const keyOf = (t) => `${String(t.artist).toLowerCase().split(/,|&| feat/)[0].trim()}|${String(t.title).toLowerCase().replace(/\s*\(.*\)/, '').trim()}`;
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [b[i], b[k]] = [b[k], b[i]]; } return b; };

// Kenya right now: songs on both YouTube and Apple's Kenya charts first, then the rest by position.
export function kenyaNow(charts) {
  const m = new Map();
  for (const [src, list] of [['youtube', charts.youtube || []], ['apple', charts.apple || []]]) {
    for (const t of list) { const k = keyOf(t); const x = m.get(k) || { t, s: 0, on: [] }; x.s += 1 - (t.pos - 1) / 50; x.on.push(src); m.set(k, x); }
  }
  return [...m.values()].sort((a, b) => b.on.length - a.on.length || b.s - a.s).map((x) => ({ ...x.t, on: x.on })).slice(0, 40);
}

// taste: { artists: { name: score } (likes ×2 + plays), skips: { artists: { name: n } }, recent: Set of track ids
// played in the last 2 days, liked: Set of ids }
export async function forYou(taste) {
  const charts = await fetchCharts();
  const cand = new Map();
  const add = (t, pts, why) => {
    if (!t?.title || !t?.artist) return;
    const k = keyOf(t); const x = cand.get(k) || { t, s: 0, why: new Set(), plat: new Set() };
    x.s += pts; x.why.add(why); if (['YouTube', 'Apple Music', 'Spotify'].includes(why)) x.plat.add(why); cand.set(k, x);
  };
  for (const [name, list] of [['YouTube', charts.youtube], ['Apple Music', charts.apple], ['Spotify', charts.spotify]]) {
    for (const t of list || []) add(t, 1.2 * (1 - (t.pos - 1) / 60), name);
  }
  // Your circle: radio of your top 3 artists + 2 related artists each.
  // Seeds: your overall favourites, pulled towards what you play at this time of day.
  const nowPlays = taste.dayparts?.[daypartNow()] || {};
  const nowTop = Math.max(1, ...Object.values(nowPlays));
  const weight = Math.max(1, ...Object.values(taste.artists || {}));
  const seedScore = (a) => (taste.artists?.[a] || 0) / weight + 1.2 * ((nowPlays[a] || 0) / nowTop);
  const top = [...new Set([...Object.keys(taste.artists || {}), ...Object.keys(nowPlays)])].sort((a, b) => seedScore(b) - seedScore(a)).slice(0, 3);
  await Promise.all(top.map(async (name) => {
    try {
      const a = await findArtist(name); if (!a) return;
      const [radio, circle] = await Promise.all([artistRadio(a.id), related(a.id, 6)]);
      radio.slice(0, 25).forEach((t, i) => add(t, 1.4 * (1 - i / 40), `Because you play ${name}`));
      const picks = shuffle(circle).slice(0, 2);
      const tops = await Promise.all(picks.map((c) => artistTop(c.id, 5).catch(() => [])));
      tops.forEach((list, j) => list.forEach((t, i) => add(t, 1.0 * (1 - i / 10), `Fans of ${name} like ${picks[j].name}`)));
    } catch { /* skip that artist */ }
  }));
  const skips = taste.skips?.artists || {};
  const scored = [...cand.values()].map((x) => {
    const affinity = (taste.artists?.[x.t.artist] || 0) / weight; // 0..1
    let s = x.s + affinity * 1.5 + (x.plat.size >= 2 ? 0.8 * (x.plat.size - 1) : 0);
    s -= Math.min(2, (skips[x.t.artist] || 0) * 0.35);
    s += 0.9 * ((nowPlays[x.t.artist] || 0) / nowTop); // right for this time of day
    if ((taste.skips?.tracks?.[keyOf(x.t)] || 0) >= 2) s -= 50; // you keep skipping this very song
    if (taste.recent?.has(x.t.id)) s -= 1.5;
    if (taste.liked?.has(x.t.id)) s -= 0.4; // For You is for finding new things too
    const why = x.plat.size >= 2 ? `Hot on ${[...x.plat].join(' + ')}` : [...x.why][0];
    return { ...x.t, why, score: s + Math.random() * 0.25 };
  }).filter((x) => x.score > -10).sort((a, b) => b.score - a.score);
  const per = {}; const out = [];
  for (const t of scored) { if ((per[t.artist] = (per[t.artist] || 0) + 1) > 2) continue; out.push(t); if (out.length >= 40) break; }
  // no two songs by the same artist back to back
  for (let i = 1; i < out.length; i++) if (out[i].artist === out[i - 1].artist) { const j = out.findIndex((t, k) => k > i && t.artist !== out[i - 1].artist); if (j > 0) [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

// Discover: artists near the ones you love that you have never played, one of their best songs each.
// taste.artists = every artist you have played or liked. Different each visit (the circle is shuffled).
export async function discover(taste) {
  const known = new Set(Object.keys(taste.artists || {}).map((a) => a.toLowerCase()));
  const top = Object.entries(taste.artists || {}).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([a]) => a);
  if (!top.length) return [];
  const found = new Map();
  await Promise.all(top.map(async (name) => {
    try {
      const a = await findArtist(name); if (!a) return;
      for (const c of await related(a.id, 12)) if (!known.has(String(c.name).toLowerCase()) && !found.has(c.id)) found.set(c.id, { c, via: name });
    } catch { /* skip that artist */ }
  }));
  const picks = shuffle([...found.values()]).slice(0, 14);
  const lists = await Promise.all(picks.map((p) => artistTop(p.c.id, 3).catch(() => [])));
  const out = [];
  lists.forEach((list, i) => {
    const t = list.find((x) => (taste.skips?.tracks?.[keyOf(x)] || 0) < 2) || null;
    if (t) out.push({ ...t, why: `New to you · fans of ${picks[i].via} play this` });
  });
  return out;
}
