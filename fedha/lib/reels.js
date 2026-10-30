// Reels: a trailer feed ranked like TikTok, Instagram Reels and Facebook Reels combined.
// Signals per title (setting 'reels_signals', capped at 500): seconds watched, ♥ like, ＋ save, quick skip (< 3 s),
// shown. A trailer you've been shown never comes back (it's excluded from new candidates too).
//   TikTok     watch time is the strongest signal (watching most of a trailer > a like); taste adapts within the
//              session: the queue is re-ranked after every swipe.
//   Instagram  likes and saves; "Because you liked X" for titles that share genres with what you liked or saved.
//   Facebook   variety: the same genre isn't shown twice in a row, and 1 slot in 5 explores something new.
// Old signals fade (half-life 21 days), so the feed follows what you're into now.
import { getSetting, setSetting } from './db';
import { trailerFor, fetchLibrary, organise, getProgress } from './chill';

const KEY = 'reels_signals';
const SRC_WEIGHT = { taste: 1, trending: 0.65, explore: 0.5, new: 0.55 };
const HALF_LIFE = 21 * 864e5;

export async function getSignals() { return (await getSetting(KEY, {})) || {}; }
// New signals object with one title updated (kept to the 500 most recent titles).
export function applySignal(signals, item, patch) {
  const cur = signals[item.title] || { g: item.genres || [], shown: 0, watch: 0 };
  const next = { ...signals, [item.title]: { ...cur, ...patch, g: item.genres || cur.g, type: item.type || cur.type, at: Date.now() } };
  return Object.fromEntries(Object.entries(next).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, 500));
}
// Saving: swipes come fast, so writes are batched (one save at most every 2 s; flushSignals() on leaving).
let pending = null; let timer = null;
export function persistSignals(next) {
  pending = next;
  if (!timer) timer = setTimeout(flushSignals, 2000);
}
export function flushSignals() {
  clearTimeout(timer); timer = null;
  if (!pending) return Promise.resolve();
  const v = pending; pending = null;
  return setSetting(KEY, v).catch(() => {});
}
export async function saveSignal(signals, item, patch) {
  const next = applySignal(signals, item, patch);
  await setSetting(KEY, next);
  return next;
}
export const seenBefore = (signals, title) => (signals[title]?.shown || 0) > 0 || !!signals[title]?.skipped;

// How much one title's signals say "more like this": watch time first (TikTok), then likes / saves (Instagram).
function weight(s) {
  const watched = Math.min(1, (s.watch || 0) / 45); // most trailers are 1.5-2.5 min; 45 s+ = really watched
  const decay = Math.pow(0.5, (Date.now() - (s.at || Date.now())) / HALF_LIFE);
  return (watched * 2 + (s.liked ? 1.5 : 0) + (s.saved ? 1.5 : 0) - (s.skipped ? 1.2 : 0)) * decay;
}
export function genreTaste(signals) {
  const g = {};
  for (const s of Object.values(signals)) { const w = weight(s); for (const x of s.g || []) g[x] = (g[x] || 0) + w; }
  return g;
}
function typeTaste(signals) {
  const t = { movie: 0, series: 0 };
  for (const s of Object.values(signals)) if (s.type) t[s.type === 'movie' ? 'movie' : 'series'] += weight(s);
  return t;
}

// Rank the candidates: score each, then build the feed with variety (no same lead genre twice in a row) and an
// exploration slot every 5th. Anything already shown is dropped.
export function rank(items, signals) {
  const taste = genreTaste(signals);
  const types = typeTaste(signals);
  const loved = Object.entries(signals).filter(([, s]) => s.liked || s.saved || (s.watch || 0) >= 45);
  const max = Math.max(1, ...Object.values(taste).map(Math.abs));
  const year = new Date().getFullYear();
  const scored = items.filter((x) => x?.title && !seenBefore(signals, x.title)).map((x) => {
    const gs = x.genres || [];
    const affinity = gs.reduce((t, g) => t + (taste[g] || 0), 0) / max / Math.max(1, Math.sqrt(gs.length)); // -1..~1.5
    const typeFit = (types[x.type === 'movie' ? 'movie' : 'series'] - types[x.type === 'movie' ? 'series' : 'movie']) / (Math.abs(types.movie) + Math.abs(types.series) + 3);
    const recent = x.year && x.year >= year - 1 ? 0.15 : 0;
    const like = loved.find(([, s]) => (s.g || []).some((g) => gs.includes(g)));
    const why = x.why || (like && affinity > 0.2 ? `Because you liked ${like[0]}` : null);
    return { ...x, why, _s: (SRC_WEIGHT[x.src] ?? 0.55) + affinity * 1.3 + typeFit * 0.4 + recent + Math.random() * 0.35, _explore: x.src === 'explore' || affinity < 0.05 };
  });
  const main = scored.filter((x) => !x._explore).sort((a, b) => b._s - a._s);
  const explore = scored.filter((x) => x._explore).sort((a, b) => b._s - a._s);
  const out = [];
  const lead = (x) => (x?.genres || [])[0];
  while (main.length || explore.length) {
    const wantExplore = (out.length + 1) % 5 === 0 && explore.length;
    const pool = wantExplore || !main.length ? explore : main;
    let i = pool.findIndex((x) => !out.length || lead(x) !== lead(out[out.length - 1])); // variety
    if (i < 0) i = 0;
    out.push(pool.splice(i, 1)[0]);
  }
  return out.map(({ _s, _explore, ...x }) => x);
}

// Candidates for the feed (server: pages/api/chill/reels.js), from what you have, liked, saw and the genres you watch.
export async function fetchCandidates(signals) {
  const [lib, prog] = await Promise.all([fetchLibrary().catch(() => ({ files: [] })), getProgress().catch(() => ({}))]);
  const { shows, movies } = organise(lib.files || []);
  const fb = prog.feedback || {};
  const body = {
    have: [...shows.map((s) => s.title), ...movies.map((m) => m.title)],
    liked: [...Object.keys(fb).filter((t) => fb[t] === 'want'), ...Object.keys(signals).filter((t) => signals[t].liked || signals[t].saved)],
    seen: Object.keys(fb).filter((t) => fb[t] === 'seen'),
    no: Object.keys(fb).filter((t) => fb[t] === 'no'),
    genres: genreTaste(signals),
    watched: Object.entries(signals).filter(([, x]) => (x.watch || 0) >= 45).map(([t]) => t).slice(0, 20), // watched most of it
    exclude: Object.keys(signals).filter((t) => seenBefore(signals, t)), // never show a trailer twice
  };
  const r = await fetch('/api/chill/reels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.ok ? (await r.json()).items || [] : [];
}

// Trailer ids for the next `n` items (4 at a time); items with no trailer are dropped.
export async function withTrailers(items, n = 4) {
  const batch = items.slice(0, n);
  const ids = await Promise.all(batch.map((x) => trailerFor(x.title, x.year ? String(x.year) : '')));
  return { ready: batch.map((x, i) => ({ ...x, trailer: ids[i] })).filter((x) => x.trailer), rest: items.slice(n) };
}

// On Wi-Fi the Chill Room calls this so Reels opens instantly (candidates + the first 4 trailers looked up).
let prefetched = null;
export function prefetchReels() {
  if (prefetched) return prefetched;
  prefetched = (async () => {
    const signals = await getSignals();
    const ranked = rank(await fetchCandidates(signals), signals);
    const first = await withTrailers(ranked, 8); // Wi-Fi only: enough for the first one plus 4+ ahead
    return { signals, ...first };
  })().catch(() => { prefetched = null; return null; });
  return prefetched;
}
export function takePrefetched() { const p = prefetched; prefetched = null; return p; }
