// Pure file-name logic for the Chill Room (no database), shared by the page (lib/chill.js) and the server
// (pages/api/chill/suggest.js).
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

