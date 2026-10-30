// Reels: a trailer feed ranked like Instagram Reels.
// Signals per title (setting 'reels_signals'): how long you watched, ♥ like, ＋ save, quick skip (< 3 s).
// They roll up into a genre taste: watching most of a trailer = +1, ♥ = +2, ＋ = +1.5, quick skip = -1 for each of its
// genres. Ranking = genre taste + where it came from (your taste > trending > new/explore) + a little randomness;
// about 1 in 5 slots is kept for exploration so the feed doesn't turn into an echo chamber.
// Trailers are fetched 4 at a time. Candidates and the first 4 can be fetched ahead on Wi-Fi (prefetchReels).
import { getSetting, setSetting } from './db';
import { trailerFor, fetchLibrary, organise, getProgress } from './chill';

const KEY = 'reels_signals';
const SRC_WEIGHT = { taste: 1, trending: 0.7, explore: 0.55, new: 0.6 };

export async function getSignals() { return (await getSetting(KEY, {})) || {}; }
export async function saveSignal(signals, item, patch) {
  const cur = signals[item.title] || { g: item.genres || [], shown: 0, watch: 0 };
  const next = { ...signals, [item.title]: { ...cur, ...patch, g: item.genres || cur.g, at: Date.now() } };
  const trimmed = Object.fromEntries(Object.entries(next).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, 500));
  await setSetting(KEY, trimmed);
  return trimmed;
}

export function genreTaste(signals) {
  const g = {};
  for (const s of Object.values(signals)) {
    const w = Math.min(1, (s.watch || 0) / 90) + (s.liked ? 2 : 0) + (s.saved ? 1.5 : 0) - (s.skipped ? 1 : 0);
    for (const x of s.g || []) g[x] = (g[x] || 0) + w;
  }
  return g;
}

export function rank(items, signals) {
  const taste = genreTaste(signals);
  const fresh = items.filter((x) => { const s = signals[x.title]; return !s || (!s.skipped && (s.shown || 0) < 2 && !s.saved); });
  const score = (x) => (SRC_WEIGHT[x.src] ?? 0.6) + (x.genres || []).reduce((t, g) => t + (taste[g] || 0) * 0.4, 0) + Math.random() * 0.8;
  const main = fresh.filter((x) => x.src === 'taste').map((x) => ({ x, s: score(x) })).sort((a, b) => b.s - a.s).map((y) => y.x);
  const other = fresh.filter((x) => x.src !== 'taste').map((x) => ({ x, s: score(x) })).sort((a, b) => b.s - a.s).map((y) => y.x);
  const out = [];
  while (main.length || other.length) {
    for (let i = 0; i < 4 && main.length; i++) out.push(main.shift());
    if (other.length) out.push(other.shift());
    if (!main.length) out.push(...other.splice(0));
  }
  return out;
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
    exclude: Object.keys(signals).filter((t) => signals[t].skipped || (signals[t].shown || 0) >= 2),
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
