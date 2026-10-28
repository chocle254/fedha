// Real, open hackathons you can register for — pulled live from Devpost and
// Devfolio's public listings (no AI, no made-up events). Each item links to
// the hackathon's own page so you can register there.
//
// GET /api/hackathons → { results: [...], sources: { devpost, devfolio } }

const UA = 'Mozilla/5.0 (Luxe hackathon finder)';
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

// Devpost gives "Oct 17 - 18, 2026", "Sep 15 - Nov 30, 2026" or
// "Dec 20, 2026 - Jan 10, 2027". Returns the last day as YYYY-MM-DD.
export function devpostEndDate(text) {
  if (!text) return '';
  const parts = String(text).split(/\s+-\s+/);
  const first = parts[0];
  const last = parts[parts.length - 1];
  const yearM = last.match(/(\d{4})/);
  if (!yearM) return '';
  const year = Number(yearM[1]);
  let monthM = last.match(/([A-Za-z]{3})[a-z]*\s+(\d{1,2})/);
  let month, day;
  if (monthM) {
    month = MONTHS[monthM[1].toLowerCase()];
    day = Number(monthM[2]);
  } else {
    const startMonth = first.match(/([A-Za-z]{3})/);
    const dayM = last.match(/^(\d{1,2})/);
    if (!startMonth || !dayM) return '';
    month = MONTHS[startMonth[1].toLowerCase()];
    day = Number(dayM[1]);
  }
  if (month == null || !day) return '';
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

// Where an in-person hackathon is. Kenya first, then the rest of Africa.
const KENYA = /\b(kenya|nairobi|mombasa|kisumu|nakuru|eldoret|thika|machakos|kiambu|strathmore|jkuat|kenyatta university|moi university|ihub)\b/i;
const AFRICA = /\b(africa|nigeria|lagos|abuja|ghana|accra|kumasi|uganda|kampala|tanzania|dar es salaam|arusha|rwanda|kigali|ethiopia|addis|south africa|cape town|johannesburg|pretoria|durban|egypt|cairo|morocco|casablanca|tunisia|senegal|dakar|zambia|lusaka|zimbabwe|harare|cameroon|ivory coast|abidjan|botswana|namibia|malawi|mozambique)\b/i;
export function placeTags(text, online) {
  const t = String(text || '');
  return { kenya: !online && KENYA.test(t), africa: !online && (KENYA.test(t) || AFRICA.test(t)) };
}
// "$50,000" → 50000. Devpost always shows prizes converted to US dollars.
export function prizeUsd(text) {
  const m = String(text || '').replace(/,/g, '').match(/\$\s*(\d+(?:\.\d+)?)\s*(k|m)?/i);
  if (!m) return 0;
  return Number(m[1]) * (m[2] ? (m[2].toLowerCase() === 'k' ? 1e3 : 1e6) : 1);
}

const stripHtml = (s) => String(s || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').trim();

async function getJSON(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal, headers: { Accept: 'application/json', 'User-Agent': UA, ...(opts.headers || {}) } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fromDevpost() {
  const base = 'https://devpost.com/api/hackathons?status[]=open&status[]=upcoming';
  const urls = [
    ...[1, 2, 3, 4, 5, 6].map((p) => `${base}&order_by=deadline&page=${p}`),
    ...[1, 2].map((p) => `${base}&order_by=prize-amount&page=${p}`), // the biggest prizes, even if they close later
    ...['nairobi', 'kenya', 'africa'].map((q) => `${base}&search=${q}`), // widen the pool; Kenya is detected from the location below
  ];
  const pages = await Promise.all(urls.map((u) => getJSON(u).then((d) => d.hackathons || []).catch(() => [])));
  return pages.flat().filter((h) => !h.invite_only).map((h) => {
    const prize = stripHtml(h.prize_amount);
    const cash = h.prizes_counts?.cash || 0;
    const where = h.displayed_location?.location || '';
    const online = /online/i.test(where);
    return {
      ...placeTags(`${where} ${h.organization_name || ''} ${h.title}`, online),
      prize_usd: cash > 0 ? prizeUsd(prize) : 0,
      id: `devpost_${h.id}`,
      source: 'Devpost',
      name: h.title,
      organizer: h.organization_name || 'Devpost',
      url: h.url,
      deadline: devpostEndDate(h.submission_period_dates),
      dates: h.submission_period_dates || '',
      time_left: h.time_left_to_submission || '',
      prize_pool: cash > 0 && prize && !/^\$?0$/.test(prize) ? prize : (h.prizes_counts?.other ? `${h.prizes_counts.other} non-cash prizes` : ''),
      themes: (h.themes || []).map((t) => t.name).join(', '),
      mode: h.displayed_location?.location || '',
      online,
      upcoming: h.open_state === 'upcoming',
      registrations: h.registrations_count || 0,
      thumbnail: h.thumbnail_url ? (h.thumbnail_url.startsWith('//') ? `https:${h.thumbnail_url}` : h.thumbnail_url) : '',
    };
  });
}

async function fromDevfolio() {
  const d = await getJSON('https://api.devfolio.co/api/search/hackathons', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'application_open', from: 0, size: 30 }),
  });
  return (d?.hits?.hits || []).map((x) => x._source).filter((h) => h && !h.private).map((h) => {
    const s = h.hackathon_setting || {};
    const closes = s.reg_ends_at || h.ends_at;
    const place = h.is_online ? 'Online' : [h.city, h.country].filter(Boolean).join(', ');
    return {
      ...placeTags(`${place} ${h.name}`, !!h.is_online),
      prize_usd: 0,
      id: `devfolio_${h.uuid}`,
      source: 'Devfolio',
      name: h.name,
      organizer: h.hosted_by || 'Devfolio',
      url: s.subdomain ? `https://${s.subdomain}.devfolio.co/` : (s.site || 'https://devfolio.co/hackathons'),
      deadline: closes ? isoDate(new Date(closes)) : '',
      dates: '',
      time_left: '',
      prize_pool: '',
      themes: (h.themes || []).map((t) => t.name).join(', '),
      mode: place || '',
      online: !!h.is_online,
      upcoming: false,
      registrations: h.participants_count || 0,
      thumbnail: s.logo || '',
      description: h.tagline || h.desc?.slice?.(0, 200) || '',
    };
  });
}

export default async function handler(req, res) {
  const [dp, df] = await Promise.allSettled([fromDevpost(), fromDevfolio()]);
  const devpost = dp.status === 'fulfilled' ? dp.value : [];
  const devfolio = df.status === 'fulfilled' ? df.value : [];

  const today = isoDate(new Date());
  const seen = new Set();
  const results = [...devpost, ...devfolio]
    .filter((h) => h.name && h.url)
    .filter((h) => !h.deadline || h.deadline > today) // at least a day left to register
    .filter((h) => { const k = h.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    // In Kenya first, then online (joinable from Kenya), then soonest deadline. The page re-sorts on demand.
    .sort((a, b) => (b.kenya - a.kenya) || (b.online - a.online) || String(a.deadline || '9').localeCompare(String(b.deadline || '9')));

  if (!results.length && dp.status === 'rejected' && df.status === 'rejected') {
    return res.status(502).json({ error: 'Could not reach Devpost or Devfolio right now. Try again in a minute.' });
  }

  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
  return res.status(200).json({
    // Keep every Kenyan / African one, then the rest up to 80.
    results: [...results.filter((h) => h.africa), ...results.filter((h) => !h.africa)].slice(0, 80),
    sources: { devpost: devpost.length, devfolio: devfolio.length },
  });
}
