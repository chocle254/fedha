// Real upcoming tech events in Kenya, pulled live (no AI, nothing made up):
//  - Google Developer Groups (gdg.community.dev): DevFests, GDG Nairobi/Kisumu/Pwani, GDG on Campus workshops.
//    Its API can't filter by country, so all live events (~1,000, two pages) are fetched and Kenya's kept.
//  - Luma's Nairobi page (lu.ma/nairobi): only the tech / startup ones.
// Cached for 3 hours per server instance.
//
// GET /api/tech-events → { results: [...], sources: { gdg, luma } }
// Each result fits the Tech Hub event card: { id, name, emoji, organizer, category, venue, city, date, time,
// end_time, tz: 'LOCAL', url, kenya: true, devfest, source }. Times are Nairobi time (the phone's local time).

const TTL = 3 * 3600e3;
let cache = { at: 0, data: null };

const UA = 'Mozilla/5.0 (Luxe tech events)';
const TECH = /\b(tech|ai|ml|data|dev|code|coding|software|web|app|cloud|cyber|security|hack|startup|founder|product|blockchain|crypto|python|javascript|flutter|android|google|gemini|api|devops|design|ux|robot|iot|engineer)/i;

// "2026-11-14T08:00:00+03:00" → { date: '2026-11-14', time: '08:00' } in Nairobi time.
function nairobi(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
}

async function getJson(url, ms = 25000) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

async function gdg() {
  const pages = await Promise.all([1, 2, 3].map((p) => getJson(`https://gdg.community.dev/api/event/?status=Live&page_size=500&page=${p}`).catch(() => null)));
  const all = pages.flatMap((p) => p?.results || []);
  if (!all.length) throw new Error('no data');
  return all
    .filter((e) => e.chapter?.country === 'KE' && !e.is_hidden && !e.is_test)
    .map((e) => {
      const s = nairobi(e.start_date); const end = nairobi(e.end_date || e.start_date);
      const devfest = /devfest/i.test(e.title);
      const campus = /on campus/i.test(e.chapter.title || '');
      return {
        id: `gdg_${e.id}`, name: e.title, emoji: devfest ? '🎉' : campus ? '🎓' : '💻',
        organizer: e.chapter.title, category: devfest ? 'DevFest' : campus ? 'Campus workshop' : 'Meetup',
        venue: e.chapter.city, city: e.chapter.city,
        date: s.date, time: s.time, end_time: end.date === s.date ? end.time : '', tz: 'LOCAL',
        end_at: e.end_date || e.start_date, url: e.url, kenya: true, devfest, is_free: true, source: 'GDG',
      };
    });
}

async function luma() {
  const d = await getJson('https://api.lu.ma/discover/get-paginated-events?discover_place_api_id=discplace-YSx1DPerjjIyq7M&pagination_limit=50');
  return (d.entries || [])
    .map((x) => ({ ev: x.event || {}, cal: x.calendar || {}, ticket: x.ticket_info || {} }))
    .filter(({ ev, cal }) => TECH.test(`${ev.name} ${cal.name || ''}`))
    .map(({ ev, cal, ticket }) => {
      const s = nairobi(ev.start_at); const end = nairobi(ev.end_at || ev.start_at);
      const city = ev.geo_address_info?.city || 'Nairobi';
      return {
        id: `luma_${ev.api_id}`, name: ev.name, emoji: '📅', organizer: cal.name && cal.name !== 'Personal' ? cal.name : 'Luma',
        category: 'Meetup', venue: ev.geo_address_info?.address || city, city,
        date: s.date, time: s.time, end_time: end.date === s.date ? end.time : '', tz: 'LOCAL',
        end_at: ev.end_at || ev.start_at, url: `https://lu.ma/${ev.url}`, kenya: true, devfest: false,
        is_free: ticket.is_free !== false, source: 'Luma',
      };
    });
}

export default async function handler(req, res) {
  if (cache.data && Date.now() - cache.at < TTL && !req.query?.fresh) return res.status(200).json(cache.data);
  const [g, l] = await Promise.allSettled([gdg(), luma()]);
  const now = Date.now();
  const horizon = now + 90 * 864e5;
  const seen = new Set();
  const results = [...(g.value || []), ...(l.value || [])]
    .filter((e) => new Date(e.end_at).getTime() > now && new Date(e.end_at).getTime() < horizon)
    .filter((e) => { const k = `${e.name.toLowerCase()}|${e.date}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const data = { results, sources: { gdg: g.status === 'fulfilled' ? g.value.length : 'failed', luma: l.status === 'fulfilled' ? l.value.length : 'failed' } };
  if (results.length) cache = { at: now, data };
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
  return res.status(200).json(data);
}
