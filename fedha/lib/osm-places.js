// lib/osm-places.js — checks that a place from a web search is really on the map, using OpenStreetMap (free, no key).
// Web results name places that have closed, moved, sit in another town or never existed; a plain Google Maps search
// for such a name lands on the nearest guess (often a building site). Here a place only counts when OpenStreetMap
// has it near you, and then it comes back with its exact spot, so the map link opens on the right pin.
// Nominatim allows about one request a second, so checks run one after another.
const UA = { 'User-Agent': 'Luxe/1.0 (personal planner app)', 'Accept-Language': 'en' };
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !['the', 'and', 'restaurant', 'cafe', 'bar', 'hotel', 'kenya', 'ltd'].includes(w));

// Same place? At least one distinctive word of the searched name must be in the map's name.
function sameName(want, got) {
  const g = words(got).join(' ');
  return words(want).some((w) => g.includes(w));
}

function box(lat, lon, d = 0.35) { return `${lon - d},${lat + d},${lon + d},${lat - d}`; }

// → { lat, lon, mapName } or null when the map does not have it near you.
export async function verifyPlace({ name, area, city, lat, lon }) {
  if (!name) return null;
  const q = [name, area, city, 'Kenya'].filter(Boolean).join(', ');
  const near = lat != null && lon != null ? `&viewbox=${box(lat, lon)}&bounded=1` : '';
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&countrycodes=ke&q=${encodeURIComponent(q)}${near}`, { headers: UA, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const hit = (await r.json()).find((x) => x.name && sameName(name, x.name) && x.addresstype !== 'road');
    return hit ? { lat: +hit.lat, lon: +hit.lon, mapName: hit.name } : null;
  } catch { return null; }
}

// Checks a list one at a time (Nominatim's one-a-second rule). Returns the same items with lat/lon added where found.
export async function verifyAll(items, ctx, key = 'name') {
  const out = [];
  for (let i = 0; i < items.length; i++) {
    if (i) await sleep(1100);
    const v = items[i][key] ? await verifyPlace({ name: items[i][key], area: items[i].area, ...ctx }) : null;
    out.push(v ? { ...items[i], lat: v.lat, lon: v.lon, on_map: true } : { ...items[i], on_map: false });
  }
  return out;
}

// Real places near you whose name or cuisine matches the thing (e.g. "pizza", "sushi", "bowling"), straight from the
// map. Used when the web search names nothing that checks out.
export async function nearbyMatching(thing, { lat, lon, radius = 10000, limit = 4 }) {
  if (lat == null || lon == null) return [];
  const re = words(thing).slice(0, 3).map((w) => w.replace(/s$/, '')).join('|');
  if (!re) return [];
  const around = `(around:${radius},${lat},${lon})`;
  const query = `[out:json][timeout:15];(nwr${around}["name"]["cuisine"~"${re}",i];nwr${around}["name"~"${re}",i]["amenity"];nwr${around}["name"~"${re}",i]["shop"];nwr${around}["name"~"${re}",i]["leisure"];);out center 30;`;
  let data = null;
  for (const host of OVERPASS) { // the main server is often busy or unreachable: try the mirrors in turn
    try {
      const r = await fetch(host, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: `data=${encodeURIComponent(query)}`, signal: AbortSignal.timeout(10000) });
      if (r.ok) { data = await r.json(); break; }
    } catch { /* next mirror */ }
  }
  if (!data) return [];
  try {
    const seen = new Set();
    const rows = (data.elements || []).map((e) => ({ name: e.tags?.name, lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon, tags: e.tags || {} }))
      .filter((p) => p.name && p.lat != null && !seen.has(p.name.toLowerCase()) && seen.add(p.name.toLowerCase()));
    const dist = (p) => Math.hypot(p.lat - lat, (p.lon - lon) * Math.cos((lat * Math.PI) / 180));
    return rows.sort((a, b) => dist(a) - dist(b)).slice(0, limit).map((p) => ({
      name: p.name,
      area: p.tags['addr:suburb'] || p.tags['addr:street'] || '',
      price: 'not stated',
      note: `${(dist(p) * 111).toFixed(1)} km from you, on the map${p.tags.opening_hours ? ` · open ${p.tags.opening_hours}` : ''}`,
      lat: p.lat, lon: p.lon, on_map: true,
    }));
  } catch { return []; }
}
