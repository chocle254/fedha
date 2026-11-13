// lib/news-read.js — the Coach's news desk. Every hour: fresh headlines from free RSS feeds (Yahoo Finance and
// Google News business / markets), and the Coach reads which ones move the markets Luxe trades, which way, how hard
// and why, including the knock-on chain (e.g. a mega-cap tech shock -> Nasdaq down -> risk-off -> gold bid).
// He works only from the headlines given; he never invents an event. Also answers "what if" questions.
// Saved in trade_settings.desk.news (small: the latest read only). Big moves send one push each.
import { aiJSON } from './ai-json';

// Business feeds alone are flooded by whatever company is in the news that day (one Nvidia story could fill the
// whole read), so world news and a war / oil-supply search sit beside them, and the list is taken round-robin
// across feeds: every feed gets its share. Slow-burning stories (a war, Hormuz) get a 12-hour window.
const G = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}%20when:1d&hl=en-US&gl=US&ceid=US:en`;
const FEEDS = [
  { url: 'https://finance.yahoo.com/news/rssindex', hours: 6 },
  { url: 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en', hours: 6 },
  { url: G('(gold OR dollar OR Fed OR Nasdaq OR oil OR tariffs OR yields OR inflation)'), hours: 6 },
  { url: 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en', hours: 12 },
  { url: G('(Iran OR Hormuz OR Ukraine OR Russia OR Israel OR OPEC OR sanctions OR China Taiwan OR missile OR ceasefire)'), hours: 12 },
];
export const MARKETS = ['XAUUSD (gold)', 'NAS100', 'US30', 'EURUSD', 'GBPUSD', 'USDJPY', 'USOIL', 'BTC'];
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const unxml = (s) => String(s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]+>/g, '');

export async function headlines({ max = 36 } = {}) {
  const now = Date.now();
  const lists = await Promise.all(FEEDS.map(async ({ url, hours }) => {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Luxe news reader)' }, signal: AbortSignal.timeout(7000) });
      if (!r.ok) return [];
      const xml = await r.text();
      return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
        const title = clip(unxml((m[1].match(/<title>([\s\S]*?)<\/title>/) || [])[1]), 180);
        const at = Date.parse((m[1].match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '') || null;
        return { title: title.replace(/ - [^-]{2,40}$/, ''), at };
      }).filter((h) => h.title && (!h.at || now - h.at <= hours * 3600e3)).sort((a, b) => (b.at || 0) - (a.at || 0));
    } catch { return []; }
  }));
  // Round-robin: one from each feed in turn, skipping repeats, so no single feed or story fills the list.
  const seen = new Set(), out = [];
  for (let i = 0; out.length < max && lists.some((l) => l.length > i); i++) {
    for (const l of lists) {
      const h = l[i]; if (!h) continue;
      const k = h.title.toLowerCase().replace(/[^a-z0-9 ]/g, '').slice(0, 50);
      if (seen.has(k)) continue; seen.add(k); out.push(h);
      if (out.length >= max) break;
    }
  }
  return out;
}

const PERSONA = 'You are a senior macro and prop-desk trader (20 years: gold, FX, US indices, oil, crypto). You read headlines the way a trading desk does: what moves, which way, how hard, how long, and through which chain (risk-on/off, the dollar, yields, the Fed, oil, safe havens, sector leaders). You only use the headlines given and never invent an event or a number. Most headlines move nothing: say so.';

// → { at, impacts: [{ market, direction, strength, horizon, headline, why }], summary } or null.
export async function readNews() {
  const list = await headlines();
  if (!list.length) return null;
  const o = await aiJSON(`${PERSONA}

HEADLINES (business news from the last 6 hours, world news and conflicts from the last 12):
${list.map((h, i) => `${i + 1}. ${h.title}`).join('\n')}

Markets: ${MARKETS.join(', ')}.
Return JSON: {"summary":"one or two sentences: the market mood these headlines set, naming the main stories, or 'quiet' if nothing matters","impacts":[{"story":"2-4 word name of the story, e.g. 'Nvidia earnings', 'Strait of Hormuz', 'Ukraine war'","market":"one of the markets","direction":"up|down","strength":1-3,"horizon":"hours|days","headline":"the headline number it comes from","why":"the chain in one sentence"}]}
Up to 6 impacts, only ones with a clear reason; strength 3 = a move a desk would act on today.
Cover the different stories, not one story many times: at most 2 impacts per story. Do not route a story through a far-fetched chain (one company's news does not move oil unless it plainly touches energy demand). Wars, shipping lanes (Hormuz, Red Sea), sanctions and OPEC are oil and gold stories first. A single company's product news (a game launch, a phone) moves that company, not these markets, unless it is big enough to move the Nasdaq.`, { maxTokens: 900, temperature: 0.2, timeout: 20000 }).catch(() => null);
  if (!o) return null;
  const impacts = (Array.isArray(o.impacts) ? o.impacts : []).map((x) => {
    const n = Number(String(x.headline).replace(/\D/g, ''));
    return { story: clip(x.story, 40), market: clip(x.market, 20), direction: x.direction === 'down' ? 'down' : 'up', strength: Math.max(1, Math.min(3, Math.round(Number(x.strength) || 1))), horizon: x.horizon === 'days' ? 'days' : 'hours', headline: clip(list[n - 1]?.title || x.headline, 180), why: clip(x.why, 220) };
  }).filter((x) => x.market && x.why);
  const perStory = {};
  const kept = impacts.filter((x) => { const k = (x.story || x.headline).toLowerCase(); perStory[k] = (perStory[k] || 0) + 1; return perStory[k] <= 2; }).slice(0, 6);
  return { at: new Date().toISOString(), summary: clip(o.summary, 300), impacts: kept, count: list.length };
}

// What the news read says about one market (for the Coach's facts on a signal).
export function impactsFor(news, symbol) {
  const key = { XAUUSD: 'XAU', NAS100: 'NAS', US30: 'US30', USOIL: 'OIL', BTCUSDT: 'BTC' }[symbol] || symbol;
  return (news?.impacts || []).filter((x) => x.market.toUpperCase().includes(key.toUpperCase()) || (key === 'XAU' && /gold/i.test(x.market))).map((x) => `${x.direction} (${x.strength}/3, ${x.horizon}): ${x.why}`);
}

// "What if NVIDIA's CEO is fired?" → the desk's read of the knock-on effects.
export async function whatIf(question) {
  const q = clip(question, 300);
  if (!q) return null;
  const o = await aiJSON(`${PERSONA}

A trader asks a hypothetical: "${q}"
Think it through like a desk: first-order move, then the knock-on chain. Markets: ${MARKETS.join(', ')}.
Return JSON: {"answer":"3-5 plain sentences: what moves first, then what follows, and what would change the picture","impacts":[{"market":"one of the markets","direction":"up|down","strength":1-3,"why":"one sentence"}],"watch":"the one thing to watch to know it is playing out"}
This is a scenario, not a forecast of what will happen: say how confident a desk would be.`, { maxTokens: 900, temperature: 0.3, timeout: 25000 }).catch(() => null);
  if (!o) return null;
  return {
    question: q, answer: clip(o.answer, 900), watch: clip(o.watch, 240),
    impacts: (Array.isArray(o.impacts) ? o.impacts : []).map((x) => ({ market: clip(x.market, 20), direction: x.direction === 'down' ? 'down' : 'up', strength: Math.max(1, Math.min(3, Math.round(Number(x.strength) || 1))), why: clip(x.why, 200) })).slice(0, 8),
  };
}
