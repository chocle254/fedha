// Your taste in the Chill Room, learned from what you actually watch (on the phone, no AI):
//   ❤️ Loved it                 strongest signal
//   binged a series (3+ eps)    strong
//   finished a movie            good
//   ＋ Want                      good
//   tried 1 episode, no more    weak minus
//   Not for me                  minus
// Each signal adds to the genres of that title; Trending and Latest are then re-ordered so what fits you comes
// first and gets a "✨ Your taste" tag. For You (api/chill/suggest.js) gets the same signals as text for the AI.
import { epCode } from './chill-names';

const ALIAS = { 'sci-fi': 'science-fiction', scifi: 'science-fiction', 'science fiction': 'science-fiction', suspense: 'thriller', 'action and adventure': 'action', anime: 'anime', animation: 'animation', 'kids': 'family', 'kids and family': 'family', 'romantic': 'romance' };
export const genreTokens = (genres = []) => [...new Set(genres.flatMap((g) => String(g).toLowerCase().split(/\s*(?:&|\/|,| and )\s*/)).map((t) => ALIAS[t.trim()] || t.trim()).filter(Boolean))];

// Per title: how much you liked it (+) or didn't (-).
export function tasteSignals({ shows = [], movies = [], prog = {} }) {
  const played = prog.played || {};
  const fb = prog.feedback || {};
  const sig = {};
  const add = (t, v) => { sig[t] = (sig[t] || 0) + v; };
  for (const s of shows) {
    const times = s.episodes.map((e) => played[`${e.show}|${epCode(e.season, e.episode)}`]).filter(Boolean);
    const n = times.length;
    // One episode and nothing for two weeks = you left it. One episode last night = still deciding.
    const leftIt = n === 1 && s.episodes.length > 2 && Number(times[0]) > 1 && Date.now() - Number(times[0]) > 14 * 864e5;
    if (n >= 3) add(s.title, 2); else if (leftIt) add(s.title, -0.5); else if (n) add(s.title, 0.5);
  }
  for (const m of movies) if (played[`movie:${m.title}`]) add(m.title, 1.5);
  for (const [t, v] of Object.entries(fb)) add(t, v === 'loved' ? 3 : v === 'want' ? 1 : v === 'seen' ? 0.3 : v === 'no' ? -2 : 0);
  return sig;
}

// Genre weights from those signals. genresOf(title) → genres you know for it (artwork, or the item itself).
export function tasteWeights(signals, genresOf) {
  const w = {};
  for (const [t, v] of Object.entries(signals)) for (const g of genreTokens(genresOf(t))) w[g] = (w[g] || 0) + v;
  return w;
}

export const tasteScore = (weights, genres) => {
  const toks = genreTokens(genres);
  return toks.length ? toks.reduce((s, g) => s + (weights[g] || 0), 0) / Math.sqrt(toks.length) : 0;
};

// Keeps the chart's order but lets taste pull a title up (or push it down); marks the strong matches.
export function byTaste(list = [], weights = {}) {
  const top = Math.max(0, ...Object.values(weights));
  return list.map((x, i) => ({ x, i, s: tasteScore(weights, x.genres) }))
    .sort((a, b) => (a.i - 3 * Math.max(-2, Math.min(4, a.s))) - (b.i - 3 * Math.max(-2, Math.min(4, b.s))))
    .map(({ x, s }) => (top > 0 && s >= Math.max(1.5, top * 0.5) ? { ...x, match: true } : x));
}
