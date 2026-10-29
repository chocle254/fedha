// Chill Room: your own movies and series, from the files on your phone (Download / Telegram / Movies, scanned by
// the Android app's LibraryActivity → /api/chill/library). This file turns file names into shows, seasons,
// episodes and movies, fetches artwork (series: TVMaze; movies: Apple's catalogue, art only), and keeps what you
// have watched ('chill_room' setting).
import { getSetting, setSetting } from './db';

// Release-group short names → the real title.
const ALIASES = {
  brba: 'Breaking Bad', bb: 'Breaking Bad', bcs: 'Better Call Saul', got: 'Game of Thrones', hotd: 'House of the Dragon',
  twd: 'The Walking Dead', twdfo: 'Fear the Walking Dead', tbbt: 'The Big Bang Theory', himym: 'How I Met Your Mother',
  aot: 'Attack on Titan', st: 'Stranger Things', tlou: 'The Last of Us', ozk: 'Ozark', peaky: 'Peaky Blinders',
  lcdp: 'Money Heist', ph: 'Prison Break', tboys: 'The Boys', sv: 'Silicon Valley', mrrobot: 'Mr. Robot',
};
const JUNK = /\b(480p|576p|720p|1080p|2160p|4k|uhd|hdr|10bit|bluray|blu-ray|brrip|bdrip|web-?dl|webrip|web|hdrip|dvdrip|hdtv|x264|x265|h\.?264|h\.?265|hevc|aac\d?(\.\d)?|ac3|ddp?\d?(\.\d)?|dts|yts|yify|rarbg|pahe(\.in)?|psa|galaxyrg|tgx|ettv|eztv|mkvcage|\d{2,4}mb|esub|subs?|dual|multi|proper|repack|extended|remastered|imax)\b.*$/i;

const titleCase = (s) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(Of|The|And|A|An|In|On|To|For)\b/g, (m, w, i) => (i ? w.toLowerCase() : w));

// "BrBa.S04E08.720p.BrRip.x264.350MB-Pahe.in.mkv" → { kind: 'episode', show: 'Breaking Bad', season: 4, episode: 8 }
// "Inception.2010.1080p.BluRay.x264.mkv"        → { kind: 'movie', title: 'Inception', year: 2010 }
export function parseName(file) {
  const raw = String(file).replace(/\.[a-z0-9]{2,4}$/i, '');
  const s = raw.replace(/[._]+/g, ' ').replace(/\[[^\]]*\]|\([^)]*(?:rip|p\b|x26)[^)]*\)/gi, ' ').replace(/\s+/g, ' ').trim();
  const ep = s.match(/^(.*?)\s*-?\s*\bS(\d{1,2})\s?E(\d{1,3})(?:\s?-?\s?E?(\d{1,3}))?\b/i) || s.match(/^(.*?)\s+(\d{1,2})x(\d{2})\b/i);
  if (ep) {
    const name = ep[1].replace(JUNK, '').replace(/[-\s]+$/, '').trim();
    const show = ALIASES[name.toLowerCase().replace(/[^a-z]/g, '')] || titleCase(name || 'Unknown series');
    return { kind: 'episode', show, season: Number(ep[2]), episode: Number(ep[3]), episodeTo: ep[4] ? Number(ep[4]) : null };
  }
  const yr = s.match(/^(.*?)\s*\(?\b(19[3-9]\d|20[0-4]\d)\b\)?/);
  const title = (yr ? yr[1] : s).replace(JUNK, '').replace(/[-\s]+$/, '').trim();
  return { kind: 'movie', title: ALIASES[title.toLowerCase().replace(/[^a-z]/g, '')] || titleCase(title || raw), year: yr ? Number(yr[2]) : null };
}

const pad = (n) => String(n).padStart(2, '0');
export const epCode = (s, e) => `S${pad(s)}E${pad(e)}`;

// Files → { shows: [{ title, seasons: { 4: [episodes…] }, episodes: [...] }], movies: [...] }
export function organise(files) {
  const shows = new Map();
  const movies = [];
  for (const f of files) {
    const p = parseName(f.name);
    const item = { ...f, ...p, key: `f:${f.id}` };
    if (p.kind === 'episode') {
      if (!shows.has(p.show)) shows.set(p.show, { title: p.show, episodes: [], added: 0 });
      const sh = shows.get(p.show);
      sh.episodes.push(item);
      sh.added = Math.max(sh.added, f.added || 0);
    } else movies.push(item);
  }
  const list = [...shows.values()].map((sh) => {
    sh.episodes.sort((a, b) => a.season - b.season || a.episode - b.episode);
    sh.seasons = [...new Set(sh.episodes.map((e) => e.season))];
    return sh;
  }).sort((a, b) => b.added - a.added);
  movies.sort((a, b) => (b.added || 0) - (a.added || 0));
  return { shows: list, movies };
}

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
  const s = await (await fetch(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(title)}&embed=episodes`)).json();
  const imgs = await (await fetch(`https://api.tvmaze.com/shows/${s.id}/images`)).json().catch(() => []);
  const bg = imgs.find((i) => i.type === 'background' && i.main) || imgs.find((i) => i.type === 'background');
  const eps = s._embedded?.episodes || [];
  return {
    poster: s.image?.original || s.image?.medium || null, backdrop: bg?.resolutions?.original?.url || null,
    summary: strip(s.summary), year: (s.premiered || '').slice(0, 4), genres: s.genres || [], rating: s.rating?.average || null,
    names: Object.fromEntries(eps.map((e) => [epCode(e.season, e.number), e.name])),
    order: eps.map((e) => epCode(e.season, e.number)),
  };
}
async function movieArt(title, year) {
  const d = await (await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(title)}&limit=10`)).json();
  const hits = (d.results || []).filter((r) => r.kind === 'feature-movie');
  const m = hits.find((r) => !year || String(r.releaseDate || '').startsWith(String(year))) || hits[0];
  return m ? { poster: big(m.artworkUrl100, '600x900'), backdrop: big(m.artworkUrl100, '1200x675'), summary: m.longDescription || '', genres: [m.primaryGenreName].filter(Boolean), rating: m.contentAdvisoryRating || null, year: (m.releaseDate || '').slice(0, 4) } : {};
}

// Artwork for everything in the library; fetches what is missing and saves it. onUpdate(art) after each one.
export async function loadArt({ shows, movies }, onUpdate) {
  const art = { ...((await getSetting(ART, {})) || {}) };
  onUpdate({ ...art });
  const jobs = [...shows.map((s) => ['show', s.title]), ...movies.map((m) => ['movie', m.title, m.year])];
  let changed = false;
  for (const [kind, title, year] of jobs) {
    const k = `${kind}:${title}`;
    if (art[k] && art[k].v === 2) continue;
    try { art[k] = { v: 2, ...(kind === 'show' ? await showArt(title) : await movieArt(title, year)) }; }
    catch { art[k] = { v: 2 }; }
    changed = true;
    onUpdate({ ...art });
  }
  if (changed) await setSetting(ART, art);
  return art;
}

// ── What you have watched ───────────────────────────────────────────────────
// { played: { "<show>|S04E08": ts, "movie:<title>": ts }, last: { show, code, at } }
const ROOM = 'chill_room';
export async function getProgress() { return (await getSetting(ROOM, { played: {}, last: null })) || { played: {}, last: null }; }
export async function markPlayed(prog, item) {
  const key = item.kind === 'episode' ? `${item.show}|${epCode(item.season, item.episode)}` : `movie:${item.title}`;
  const next = { played: { ...prog.played, [key]: Date.now() }, last: item.kind === 'episode' ? { show: item.show, code: epCode(item.season, item.episode), at: Date.now() } : { movie: item.title, at: Date.now() } };
  await setSetting(ROOM, next);
  return next;
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
export const scanLink = 'intent://library#Intent;scheme=luxe;package=com.chocle254.fedha;end';
