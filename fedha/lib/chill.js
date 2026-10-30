// Chill Room: your own movies and series, from the files on your phone (Download / Telegram / Movies, scanned by
// the Android app's LibraryActivity → /api/chill/library). This file turns file names into shows, seasons,
// episodes and movies, fetches artwork (series: TVMaze; movies: Apple's catalogue, art only), and keeps what you
// have watched ('chill_room' setting).
import { getSetting, setSetting } from './db';

import { parseName, organise, epCode } from './chill-names';

export { parseName, organise, epCode };
const pad = (n) => String(n).padStart(2, '0');

export async function fetchLibrary() {
  const r = await fetch('/api/chill/library', { cache: 'no-store' });
  return r.ok ? r.json() : { files: [], scanned_at: null };
}

// ── Artwork (cached in the 'chill_art' setting) ─────────────────────────────
// series: { poster, backdrop, summary, year, genres, rating, total } from TVMaze; movies: { poster, backdrop, summary } from Apple.
const ART = 'chill_art';
const big = (u, size) => (u ? u.replace(/\/\d+x\d+(bb)?\.(jpg|png)$/, `/${size}bb.jpg`) : null);
const strip = (h) => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function showArt(title) {
  const s = await (await fetch(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(title)}&embed[]=episodes&embed[]=nextepisode`)).json();
  const nx = s._embedded?.nextepisode;
  const imgs = await (await fetch(`https://api.tvmaze.com/shows/${s.id}/images`)).json().catch(() => []);
  const bg = imgs.find((i) => i.type === 'background' && i.main) || imgs.find((i) => i.type === 'background');
  const eps = s._embedded?.episodes || [];
  return {
    poster: s.image?.original || s.image?.medium || null, backdrop: bg?.resolutions?.original?.url || null,
    summary: strip(s.summary), year: (s.premiered || '').slice(0, 4), genres: s.genres || [], rating: s.rating?.average || null,
    names: Object.fromEntries(eps.map((e) => [epCode(e.season, e.number), e.name])),
    imdb: s.externals?.imdb || null, // for intro / credits times in Luxe's player
    status: s.status || null,
    next: nx ? { season: nx.season, number: nx.number, name: nx.name, airdate: nx.airdate, airstamp: nx.airstamp } : null, // Coming Soon
    stills: Object.fromEntries(eps.filter((e) => e.image).map((e) => [epCode(e.season, e.number), e.image.original || e.image.medium])),
    order: eps.map((e) => epCode(e.season, e.number)),
  };
}
async function movieArt(title, year) {
  const d = await (await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(title)}&limit=10`)).json();
  const hits = (d.results || []).filter((r) => r.kind === 'feature-movie');
  const m = hits.find((r) => !year || String(r.releaseDate || '').startsWith(String(year))) || hits[0];
  return m ? { poster: big(m.artworkUrl100, '600x900'), backdrop: big(m.artworkUrl100, '1200x675'), summary: m.longDescription || '', genres: [m.primaryGenreName].filter(Boolean), rating: m.contentAdvisoryRating || null, year: (m.releaseDate || '').slice(0, 4) } : {};
}

// A title whose type isn't known (saved from Reels before the type was kept): a movie if Apple has a film with that
// exact title, otherwise a series. Remembered as art['any:<title>'] = { kind }.
async function guessKind(title) {
  const d = await (await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(title)}&entity=movie&limit=5`)).json().catch(() => ({}));
  const t = sameTitle(title);
  return (d.results || []).some((r) => sameTitle(r.trackName) === t) ? 'movie' : 'show';
}
// Titles compared loosely: case, punctuation and a leading "The" don't matter ("The Office" = "Office").
export const sameTitle = (t) => String(t || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim().replace(/^the /, '');

// Artwork for everything in the library; fetches what is missing and saves it. onUpdate(art) after each one.
// extra: suggested titles [{ type: 'series' | 'movie' | undefined, title, year }] to fetch artwork for too.
export async function loadArt({ shows, movies, extra = [] }, onUpdate) {
  const art = { ...((await getSetting(ART, {})) || {}) };
  onUpdate({ ...art });
  const kindOf = (x) => (x.type === 'movie' ? 'movie' : x.type === 'series' ? 'show' : 'any');
  const jobs = [...shows.map((s) => ['show', s.title]), ...movies.map((m) => ['movie', m.title, m.year]), ...extra.map((x) => [kindOf(x), x.title, x.year])];
  let changed = false;
  for (let [kind, title, year] of jobs) { // eslint-disable-line prefer-const
    if (kind === 'any') {
      if (!art[`any:${title}`]?.kind) { art[`any:${title}`] = { kind: await guessKind(title).catch(() => 'show') }; changed = true; }
      kind = art[`any:${title}`].kind;
    }
    const k = `${kind}:${title}`;
    if (art[k] && art[k].v === 5) continue;
    try { art[k] = { v: 5, ...(kind === 'show' ? await showArt(title) : await movieArt(title, year)) }; }
    catch { art[k] = { v: 5 }; }
    changed = true;
    onUpdate({ ...art });
  }
  if (changed) await setSetting(ART, art);
  return art;
}

// ── What you have watched ───────────────────────────────────────────────────
// { played: { "<show>|S04E08": ts, "movie:<title>": ts }, last: { show, code, at },
//   feedback: { "<title>": 'want' | 'seen' | 'no' } (your reactions to For You picks; the AI learns from them) }
const ROOM = 'chill_room';
// What you played from the page, plus what Luxe's player reported as watched ('chill_watched').
export async function getProgress() {
  const [room, watched, progress] = await Promise.all([getSetting(ROOM, { played: {}, last: null }), getSetting('chill_watched', {}), getSetting('chill_progress', {})]);
  const p = room || { played: {}, last: null };
  // progress: { "<show>|S04E11" | "movie:<title>": { pos, dur, at } } from Luxe's player (Continue Watching).
  return { ...p, played: { ...(watched || {}), ...(p.played || {}) }, progress: progress || {} };
}
export async function markPlayed(prog, item) {
  const key = item.kind === 'episode' ? `${item.show}|${epCode(item.season, item.episode)}` : `movie:${item.title}`;
  const next = { ...prog, played: { ...prog.played, [key]: Date.now() }, last: item.kind === 'episode' ? { show: item.show, code: epCode(item.season, item.episode), at: Date.now() } : { movie: item.title, at: Date.now() } };
  await setSetting(ROOM, next);
  return next;
}
// item (optional): { type, year } so Want to Watch knows a movie from a series and can show its poster.
export async function setFeedback(prog, title, value, item = null) {
  const fb = { ...(prog.feedback || {}) };
  const meta = { ...(prog.meta || {}) };
  if (value) fb[title] = value; else delete fb[title];
  if (value && item?.type) meta[title] = { type: item.type === 'movie' ? 'movie' : 'series', year: item.year || null }; else if (!value) delete meta[title];
  const next = { ...prog, feedback: fb, meta };
  await setSetting(ROOM, next);
  return next;
}

// For You picks from the AI (pages/api/chill/suggest.js).
export async function fetchSuggest(refresh = false) {
  const r = await fetch(`/api/chill/suggest${refresh ? '?refresh=1' : ''}`, { cache: 'no-store' });
  return r.ok ? r.json() : { items: [] };
}

export const isPlayed = (prog, item) => !!prog.played?.[item.kind === 'episode' ? `${item.show}|${epCode(item.season, item.episode)}` : `movie:${item.title}`];

// For a show: the episode to watch next (first downloaded one after the last you played), and if the next real
// episode is not on the phone, its code so the page can say "S05E01 not downloaded".
export function upNext(show, prog, art) {
  const played = show.episodes.filter((e) => isPlayed(prog, e));
  const lastIdx = played.length ? show.episodes.indexOf(played[played.length - 1]) : -1;
  const next = show.episodes[lastIdx + 1] || null;
  let missing = null;
  if (lastIdx >= 0 && art?.order) {
    const lastCode = epCode(show.episodes[lastIdx].season, show.episodes[lastIdx].episode);
    const want = art.order[art.order.indexOf(lastCode) + 1];
    if (want && (!next || epCode(next.season, next.episode) !== want)) missing = want;
  }
  return { next, missing, started: lastIdx >= 0 };
}

// Tonight's watch window(s) from today's planner ('series' / 'movies' blocks), for the session pill.
export async function watchWindow() {
  const [blocks, date] = await Promise.all([getSetting('planner_blocks', null), getSetting('planner_blocks_date', null)]);
  const today = new Date();
  const iso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  if (!Array.isArray(blocks) || (date && date !== iso)) return [];
  const toMs = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d.getTime(); };
  return blocks.filter((b) => /^(series|movies)/.test(String(b.id))).map((b) => ({ start: toMs(b.time), end: toMs(b.time) + Number(b.duration || 0) * 60e3 }));
}

export const playLink = (file) => `intent://play?id=${file.id}#Intent;scheme=luxe;package=com.chocle254.fedha;end`;

// Luxe's own player. queue: [{ id, t (title shown), k (progress key), imdb, s, e }]; sound: theater | max | off.
export function watchLink(queue, sound = 'theater') {
  const json = JSON.stringify(queue.slice(0, 12));
  const b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `intent://watch?q=${b64}&sound=${encodeURIComponent(sound)}#Intent;scheme=luxe;package=com.chocle254.fedha;end`;
}
export const progressKey = (item) => (item.kind === 'episode' ? `${item.show}|${epCode(item.season, item.episode)}` : `movie:${item.title}`);
export const scanLink = 'intent://library#Intent;scheme=luxe;package=com.chocle254.fedha;end';

// ── Trailers (data-friendly) ────────────────────────────────────────────────
// Only ever on a tap. On mobile data YouTube is asked for its lowest quality (~3-5 MB a trailer); on Wi-Fi, HD.
export function connection() {
  const c = typeof navigator !== 'undefined' ? navigator.connection || navigator.mozConnection || navigator.webkitConnection : null;
  const wifi = c?.type === 'wifi' || c?.type === 'ethernet';
  const cellular = c?.type === 'cellular' || (!wifi && /2g|3g/.test(c?.effectiveType || ''));
  return { wifi, cellular: cellular || (!wifi && !!c?.saveData), saveData: !!c?.saveData, known: !!c?.type };
}
const trailerCache = new Map();
export async function trailerFor(name, extra = '') {
  const k = `${name}|${extra}`;
  if (trailerCache.has(k)) return trailerCache.get(k);
  const p = fetch(`/api/music/video?${new URLSearchParams({ kind: 'trailer', artist: name, title: extra, key: `tr:${name}|${extra}`.slice(0, 80) })}`)
    .then((r) => (r.ok ? r.json() : {})).then((j) => j.id || null).catch(() => null);
  trailerCache.set(k, p);
  return p;
}
export function trailerSrc(id, { wifi }) {
  const q = new URLSearchParams({ autoplay: '1', playsinline: '1', modestbranding: '1', rel: '0', iv_load_policy: '3', vq: wifi ? 'hd720' : 'tiny' });
  return `https://www.youtube-nocookie.com/embed/${id}?${q}`;
}
