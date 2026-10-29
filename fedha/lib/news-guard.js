// News guard: before a signal is traded, check the economic calendar for big news on that market's currencies.
//   Danger window (15 min before to 10 min after a high-impact release): real/demo accounts skip the trade,
//   paper trades at a quarter lot (results are scored in R, so the channel is still measured fairly).
//   Caution window (1 h before, or up to 30 min after): half lot everywhere.
// Calendar: the free Forex Factory weekly feed (nfs.faireconomy.media). It allows only a few requests per
// few minutes, so it is cached for an hour per server instance and a stale copy is kept if a fetch fails.
// If the calendar can't be loaded at all, trades go ahead as normal (the guard never blocks on its own failure).
// AI (NVIDIA, Groq as backup) only writes the one-line "why" in the notification, and only when the guard acts.
import { instrument } from './instruments';
import { nvidiaChat } from './nvidia-client';

const FEED = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const CACHE_MS = 60 * 60e3;
const MIN = 60e3;
export const DANGER = { before: 15 * MIN, after: 10 * MIN };
export const CAUTION = { before: 60 * MIN, after: 30 * MIN };

let cache = { at: 0, events: null };

export async function calendar() {
  if (cache.events && Date.now() - cache.at < CACHE_MS) return cache.events;
  try {
    const r = await fetch(FEED, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(`calendar ${r.status}`);
    const rows = await r.json();
    const events = (Array.isArray(rows) ? rows : [])
      .filter((e) => e.impact === 'High' || e.impact === 'Medium')
      .map((e) => ({ title: e.title, currency: e.country, impact: e.impact, at: Date.parse(e.date), forecast: e.forecast || '', previous: e.previous || '' }))
      .filter((e) => Number.isFinite(e.at));
    cache = { at: Date.now(), events };
    return events;
  } catch (e) {
    console.warn('[luxe] news calendar unavailable:', e.message);
    if (cache.events) cache.at = Date.now() - CACHE_MS + 5 * MIN; // keep the stale copy, retry in 5 min
    return cache.events || [];
  }
}

// Currencies whose news moves this market. Metals, oil, US indices, DXY and crypto all move on US data.
export function currenciesOf(symbol) {
  const s = String(symbol || '').toUpperCase();
  const i = instrument(s);
  if (i && i.group === 'Forex') return [s.slice(0, 3), s.slice(3, 6)];
  return ['USD'];
}

// The news situation for a market right now: { level: 'clear'|'caution'|'danger', mult, event, minutes }.
// minutes > 0 = the release is ahead; minutes <= 0 = it came out that long ago.
export async function newsCheck(symbol, now = Date.now()) {
  const cur = currenciesOf(symbol);
  const events = (await calendar()).filter((e) => e.impact === 'High' && cur.includes(e.currency));
  let worst = { level: 'clear', mult: 1, event: null, minutes: null };
  for (const e of events) {
    const d = e.at - now;
    const level = d <= DANGER.before && d >= -DANGER.after ? 'danger'
      : d <= CAUTION.before && d >= -CAUTION.after ? 'caution' : null;
    if (!level) continue;
    const better = !worst.event || (level === 'danger' && worst.level !== 'danger') || (level === worst.level && Math.abs(d) < Math.abs(worst.event.at - now));
    if (better) worst = { level, mult: level === 'danger' ? 0.25 : 0.5, event: e, minutes: Math.round(d / MIN) };
  }
  return worst;
}

// High-impact news in the next `hours` for the given markets (for the trading screen's "News ahead" strip).
export async function upcomingNews(symbols, hours = 24, now = Date.now()) {
  const cur = new Set(symbols.flatMap(currenciesOf));
  return (await calendar())
    .filter((e) => e.impact === 'High' && cur.has(e.currency) && e.at >= now - CAUTION.after && e.at <= now + hours * 3600e3)
    .sort((a, b) => a.at - b.at)
    .map((e) => ({ ...e, markets: symbols.filter((s) => currenciesOf(s).includes(e.currency)) }));
}

export const whenText = (minutes) => (minutes > 0 ? `in ${minutes} min` : minutes === 0 ? 'right now' : `${-minutes} min ago`);

const why = new Map(); // "event|symbol" -> AI sentence, kept while the instance is warm
// One short sentence on what this release does to this market. Falls back to a plain line if the AI is slow.
export async function newsReason(check, symbol) {
  const e = check.event;
  const plain = `${e.currency} ${e.title} ${whenText(check.minutes)}: prices can jump and spreads widen.`;
  const key = `${e.title}|${e.at}|${symbol}`;
  if (why.has(key)) return `${e.currency} ${e.title} ${whenText(check.minutes)}: ${why.get(key)}`;
  try {
    const prompt = `In ONE plain sentence of at most 22 words, tell a retail trader what the ${e.currency} release "${e.title}"${e.forecast ? ` (forecast ${e.forecast}, previous ${e.previous || 'n/a'})` : ''} usually does to ${symbol} and why that is risky for a fresh trade. No preamble, no advice to "consult", no emojis.`;
    const out = await Promise.race([
      nvidiaChat({ prompt, temperature: 0.3, maxTokens: 80 }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 7000)),
    ]);
    const line = String(out || '').replace(/\s+/g, ' ').trim().replace(/^["']|["']$/g, '');
    if (!line || line.length > 220) return plain;
    why.set(key, line);
    return `${e.currency} ${e.title} ${whenText(check.minutes)}: ${line}`;
  } catch {
    return plain;
  }
}
