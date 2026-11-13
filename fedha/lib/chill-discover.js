// What's out there right now, for the Chill Room's Series / Movies / Animation tabs (server side).
//   Series and animated series: TVMaze's schedules for the last week (streaming + US TV). Trending = the most
//     followed shows with new episodes this week; Latest = new shows and new seasons that just started.
//   Movies and animated movies: Apple's top movies chart (US). Trending = chart order; Latest = newest releases on it.
// No keys needed. The API route caches the result at the CDN for 6 hours, so this runs a few times a day at most.
const day = (d) => d.toISOString().slice(0, 10);
const strip = (h) => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 240);
const j = async (url) => { try { const r = await fetch(url, { headers: { 'User-Agent': 'Luxe/1.0' } }); return r.ok ? r.json() : null; } catch { return null; } };

async function tvShows() {
  const dates = [...Array(7)].map((_, i) => day(new Date(Date.now() - i * 864e5)));
  const lists = await Promise.all([
    ...dates.map((d) => j(`https://api.tvmaze.com/schedule/web?date=${d}`)),
    ...dates.slice(0, 4).map((d) => j(`https://api.tvmaze.com/schedule?country=US&date=${d}`)),
  ]);
  const seen = new Map();
  for (const ep of lists.flat().filter(Boolean)) {
    const sh = ep._embedded?.show || ep.show;
    if (!sh?.id) continue;
    const prev = seen.get(sh.id) || { sh, last: '', seasonStart: '' };
    if (ep.airdate > prev.last) prev.last = ep.airdate;
    if (ep.number === 1 && ep.airdate > prev.seasonStart) { prev.seasonStart = ep.airdate; prev.season = ep.season; }
    seen.set(sh.id, prev);
  }
  const cutoff = day(new Date(Date.now() - 90 * 864e5));
  return [...seen.values()].filter(({ sh }) => ['Scripted', 'Animation'].includes(sh.type) && !(sh.genres || []).includes('Children')
    && (sh.weight || 0) >= 50 && (!sh.premiered || sh.premiered >= '2000') && sh.image?.medium
    // English, Japanese for anime, and the big international hits (most followed) in any language.
    && (sh.language === 'English' || (sh.type === 'Animation' && sh.language === 'Japanese') || (sh.weight || 0) >= 90))
    .map(({ sh, seasonStart, season }) => {
      const isNew = sh.premiered && sh.premiered >= cutoff;
      return {
        title: sh.name, type: 'series', animation: sh.type === 'Animation' || (sh.genres || []).includes('Anime'),
        year: sh.premiered ? Number(sh.premiered.slice(0, 4)) : null, poster: sh.image.medium, genres: sh.genres || [],
        why: strip(sh.summary), rating: sh.rating?.average || null, where: sh.webChannel?.name || sh.network?.name || '',
        weight: sh.weight || 0, fresh: isNew ? sh.premiered : seasonStart || '',
        note: isNew ? 'New show' : seasonStart ? 'New season' : '',
      };
    });
}

const big = (url) => String(url || '').replace(/\/\d+x\d+bb\.(png|jpg)$/, '/400x600bb.jpg');
const ANIM = /animat|pixar|dreamworks|illumination|anime/i;
async function chart(genre = '', limit = 100) {
  const d = await j(`https://itunes.apple.com/us/rss/topmovies/limit=${limit}${genre ? `/genre=${genre}` : ''}/json`);
  const e = d?.feed?.entry; const list = Array.isArray(e) ? e : e ? [e] : [];
  return list.map((x, i) => {
    const g = x.category?.attributes?.label || ''; const why = strip(x.summary?.label);
    const rel = String(x['im:releaseDate']?.label || '').slice(0, 10);
    return {
      title: x['im:name']?.label || '', type: 'movie', animation: g === 'Anime' || (g === 'Kids & Family' && ANIM.test(why)),
      year: rel ? Number(rel.slice(0, 4)) : null, poster: big(x['im:image']?.slice(-1)[0]?.label), genres: g ? [g] : [], why, rank: i, released: rel,
      kidsOnly: g === 'Kids & Family',
    };
  }).filter((x) => x.title);
}

// One from each list in turn: animated series and animated movies side by side.
const mix = (a, b) => [...Array(Math.max(a.length, b.length))].flatMap((_, i) => [a[i], b[i]]).filter(Boolean);

export async function buildDiscover() {
  const [shows, top, anime, family] = await Promise.all([tvShows(), chart(), chart('4402', 50), chart('4410', 100)]);
  const recent = day(new Date(Date.now() - 150 * 864e5));
  const byWeight = (a, b) => b.weight - a.weight || (b.rating || 0) - (a.rating || 0);
  const byFresh = (a, b) => (b.fresh || '').localeCompare(a.fresh || '') || b.weight - a.weight;
  const byRelease = (a, b) => b.released.localeCompare(a.released);
  const live = shows.filter((x) => !x.animation); const toons = shows.filter((x) => x.animation);
  const films = top.filter((x) => !x.animation && !x.kidsOnly);
  const animFilms = [...new Map([...top, ...anime, ...family].filter((x) => x.animation).map((x) => [x.title, x])).values()];
  const strip2 = (x) => { const { weight, fresh, rank, released, kidsOnly, ...rest } = x; return rest; }; // eslint-disable-line no-unused-vars
  const take = (list, n = 20) => list.slice(0, n).map(strip2);
  return {
    at: new Date().toISOString(),
    series: { trending: take([...live].sort(byWeight)), latest: take(live.filter((x) => x.fresh).sort(byFresh)) },
    movies: { trending: take(films), latest: take(films.filter((x) => x.released >= recent).sort(byRelease)) },
    animation: {
      trending: take(mix([...toons].sort(byWeight), animFilms)),
      latest: take(mix(toons.filter((x) => x.fresh).sort(byFresh), [...animFilms].sort(byRelease))),
    },
  };
}
