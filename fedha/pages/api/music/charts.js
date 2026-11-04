import { requireUser } from '../../../lib/require-user';

// What's hot on the three big platforms, matched to Deezer tracks (cover art, ids, artist ids) so the Music Room can
// play them and blend them into For You (lib/music-foryou.js):
//   youtube  YouTube's weekly top songs in Kenya (kworb.net/youtube/insights/ke.html)
//   apple    Apple Music / iTunes top songs in Kenya (Apple's public RSS feed)
//   spotify  Spotify's daily charts: global and Nigeria (kworb.net; Spotify has no public Kenya chart)
// Cached at the edge for 6 hours, so the scraping happens a few times a day at most.
const UA = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) LuxeMusicRoom/1.0' };
const get = (u) => fetch(u, { headers: UA, signal: AbortSignal.timeout(12000) }).then((r) => (r.ok ? r.text() : ''));
const unhtml = (s) => String(s).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').trim();

async function youtubeKE() {
  const html = await get('https://kworb.net/youtube/insights/ke.html');
  return [...html.matchAll(/<div>([^<]+?) - ([^<]+)<\/div>/g)].slice(0, 40).map((m) => ({ artist: unhtml(m[1]), title: unhtml(m[2]) }));
}
async function appleKE() {
  const j = JSON.parse((await get('https://itunes.apple.com/ke/rss/topsongs/limit=40/json')) || '{}');
  return (j.feed?.entry || []).map((e) => ({ artist: e['im:artist']?.label || '', title: e['im:name']?.label || '' }));
}
async function spotify(country) {
  const html = await get(`https://kworb.net/spotify/country/${country}_daily.html`);
  return [...html.matchAll(/<td class="text mp"><div>(.*?)<\/div><\/td>/g)].slice(0, 30).map((m) => {
    const [a, ...rest] = unhtml(m[1]).split(' - ');
    return { artist: a, title: rest.join(' - ').replace(/\s*\(w\/.*\)$/, '') };
  });
}

const clean = (s) => String(s).replace(/\s*[([](feat|ft|with|prod)[^)\]]*[)\]]/gi, '').trim();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function toDeezer(x) {
  const q = `${clean(x.artist).split(/,|&| x /i)[0]} ${clean(x.title)}`;
  for (let tryNo = 0; tryNo < 3; tryNo++) {
    try {
      const r = await fetch(`https://api.deezer.com/search?${new URLSearchParams({ q, limit: '1' })}`, { signal: AbortSignal.timeout(8000) });
      const j = await r.json();
      if (j?.error?.code === 4) { await wait(1500 * (tryNo + 1)); continue; } // Deezer's 50 calls / 5 s quota
      const t = j?.data?.[0];
      if (t) {
        return {
          id: `dz:${t.id}`, dz: t.id, source: 'yt', title: t.title_short || t.title, artist: t.artist?.name || x.artist, artistId: t.artist?.id || null,
          art: t.album?.cover_medium || null, artBig: t.album?.cover_xl || t.album?.cover_big || null, duration: t.duration || 0, rank: t.rank || 0,
        };
      }
      break;
    } catch { break; }
  }
  // Not on Deezer (common for Kenyan hits): still playable, YouTube finds it by artist and title.
  return { id: `ch:${x.artist}|${x.title}`.slice(0, 120), source: 'yt', title: clean(x.title), artist: clean(x.artist), art: null, artBig: null, duration: 0 };
}
async function resolve(list) {
  const out = [];
  for (let i = 0; i < list.length; i += 5) { out.push(...(await Promise.all(list.slice(i, i + 5).map(toDeezer)))); await wait(450); }
  return out.map((t, i) => ({ ...t, pos: i + 1 }));
}

export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  const [yt, ap, sg, sn] = await Promise.all([youtubeKE().catch(() => []), appleKE().catch(() => []), spotify('global').catch(() => []), spotify('ng').catch(() => [])]);
  // One source at a time, so the catalogue lookups stay under Deezer's rate limit.
  const youtube = await resolve(yt); const apple = await resolve(ap); const spotGlobal = await resolve(sg); const spotNg = await resolve(sn);
  res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
  return res.status(200).json({ youtube, apple, spotify: [...spotGlobal, ...spotNg.map((t) => ({ ...t, pos: t.pos + 0.5 }))], at: new Date().toISOString() });
}
