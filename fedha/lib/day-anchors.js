// Real-day anchors for the Planner: liquid-soap batches, a weather-picked bath time, a small-space
// workout right before the bath, and a walk at the nicest time of day. They are pinned on the clock
// (like Tech Hub events) and the flexible blocks are trimmed around them.
//
// Weather: Open-Meteo (free, no key). Location is asked for once and stored in settings.
import { getSetting, setSetting } from './db';

export const SOAP_BATCH_MIN = 90;
const BATH_MIN = 20;
const WALK_MIN = 40;

const pad = (n) => String(n).padStart(2, '0');
export const m2t = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
export const t2m = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

// ── Location (asked once) ───────────────────────────────────────────────────
export async function getHomeLocation() {
  return getSetting('home_location', null);
}

async function placeName(lat, lon) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`);
    const d = await r.json();
    return d.address?.city || d.address?.town || d.address?.suburb || d.address?.county || d.address?.state || 'Your area';
  } catch { return 'Your area'; }
}

// Uses the phone's GPS once and remembers the result. Returns the location, or null if refused.
export function askDeviceLocation() {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      const loc = { lat: +lat.toFixed(3), lon: +lon.toFixed(3), name: await placeName(lat, lon), at: new Date().toISOString() };
      await setSetting('home_location', loc);
      resolve(loc);
    }, async () => { await setSetting('home_location_refused', true); resolve(null); }, { timeout: 15000, maximumAge: 86400000 });
  });
}

// Fallback when GPS is refused: search a town or city by name.
export async function searchPlace(name) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&format=json`);
  const j = await r.json();
  return (j.results || []).map((p) => ({ lat: p.latitude, lon: p.longitude, name: [p.name, p.admin1, p.country].filter(Boolean).join(', ') }));
}
export async function saveHomeLocation(loc) {
  const v = { ...loc, at: new Date().toISOString() };
  await setSetting('home_location', v);
  return v;
}

// ── Weather (cached for 2 hours) ──────────────────────────────────────────────
const WMO = { 0: '☀️ Clear', 1: '🌤 Mostly clear', 2: '⛅ Partly cloudy', 3: '☁️ Cloudy', 45: '🌫 Fog', 48: '🌫 Fog', 51: '🌦 Drizzle', 53: '🌦 Drizzle', 55: '🌦 Drizzle', 61: '🌧 Rain', 63: '🌧 Rain', 65: '🌧 Heavy rain', 80: '🌦 Showers', 81: '🌧 Showers', 82: '⛈ Heavy showers', 95: '⛈ Thunderstorm', 96: '⛈ Thunderstorm', 99: '⛈ Thunderstorm' };
export const weatherLabel = (code) => WMO[code] || '🌡';

export async function getTodayWeather(loc, { force = false } = {}) {
  if (!loc) return null;
  const cached = await getSetting('weather_cache', null);
  if (!force && cached && cached.date === today() && cached.lat === loc.lat && cached.lon === loc.lon && Date.now() - cached.fetchedAt < 2 * 3600e3) return cached;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min&current=temperature_2m,weather_code&timezone=auto&forecast_days=1`;
    const r = await fetch(url);
    if (!r.ok) return cached;
    const j = await r.json();
    const hours = (j.hourly?.time || []).map((t, i) => ({
      m: t2m(t.slice(11, 16)),
      temp: j.hourly.temperature_2m[i],
      feels: j.hourly.apparent_temperature[i],
      rain: j.hourly.precipitation_probability?.[i] ?? 0,
      code: j.hourly.weather_code[i],
    }));
    const data = {
      date: today(), fetchedAt: Date.now(), lat: loc.lat, lon: loc.lon, hours,
      now: { temp: j.current?.temperature_2m, code: j.current?.weather_code },
      max: j.daily?.temperature_2m_max?.[0], min: j.daily?.temperature_2m_min?.[0],
      sunrise: j.daily?.sunrise?.[0]?.slice(11, 16), sunset: j.daily?.sunset?.[0]?.slice(11, 16),
    };
    await setSetting('weather_cache', data);
    return data;
  } catch { return cached; }
}

const hourAt = (w, m) => w?.hours?.find((h) => h.m === Math.floor(m / 60) * 60) || null;

// ── Day settings ────────────────────────────────────────────────────────────
export async function getDayPrefs() {
  return {
    soapCount: Number(await getSetting(`soap_batches_${today()}`, 0)) || 0,
    soapStart: (await getSetting('soap_start', '14:00')) || '14:00',
    bathMinTemp: Number(await getSetting('bath_min_temp', 20)) || 20,
    walk: (await getSetting('walk_daily', true)) !== false,
    workoutMode: (await getSetting('workout_mode', 'small')) || 'small',
    workoutStreak: Number(await getSetting('workout_streak', 0)) || 0,
    walkIdeas: (await getSetting('activities_last', [])) || [],
  };
}
export async function setSoapBatches(n) { await setSetting(`soap_batches_${today()}`, Math.max(0, Math.min(6, n))); }

// ── Placement ──────────────────────────────────────────────────────────────
const overlaps = (s, e, busy) => busy.some(([bs, be]) => s < be && e > bs);
function firstFree(from, len, busy, until = 23 * 60) {
  for (let s = from; s + len <= until; s += 5) {
    const hit = busy.find(([bs, be]) => s < be && s + len > bs);
    if (!hit) return s;
    s = Math.max(s, hit[1] - 5);
  }
  return null;
}

const FALLBACK_WALKS = [
  'Walk to a café or library and work from there for an hour',
  'Neighbourhood loop with a podcast or audiobook',
  'Walk to the nearest market or park and back',
  'Check Tech Hub → Events for a meetup you could walk or ride to',
];

// Returns the pinned blocks for today. `blocks` is the already-built day (used to keep clear of
// meals, events and sleep). `wake` is minutes since midnight when the day starts.
export function planAnchors({ blocks, weather, prefs, wake, workoutMinutes = 0, workoutNote = '' }) {
  const out = [];
  const warnings = [];
  const startOf = (b) => t2m(b.time);
  const hard = blocks.filter((b) => ['meal', 'event'].includes(b.type) || b.id === 'sleep').map((b) => [startOf(b), b.id === 'sleep' ? 24 * 60 : startOf(b) + b.duration]);
  const soft = blocks.filter((b) => b.type === 'routine').map((b) => [startOf(b), startOf(b) + b.duration]);
  const busy = [...hard];
  const dayStart = Math.max(wake, 6 * 60);

  // 1. Soap batches, from the usual afternoon start, flowing around meals.
  if (prefs.soapCount > 0) {
    let cursor = Math.max(t2m(prefs.soapStart), dayStart);
    const runs = [];
    for (let i = 0; i < prefs.soapCount; i++) {
      const s = firstFree(cursor, SOAP_BATCH_MIN, busy);
      if (s == null) break;
      const last = runs[runs.length - 1];
      if (last && last.end === s) { last.end += SOAP_BATCH_MIN; last.n++; } else runs.push({ start: s, end: s + SOAP_BATCH_MIN, n: 1 });
      busy.push([s, s + SOAP_BATCH_MIN]);
      cursor = s + SOAP_BATCH_MIN;
    }
    let k = 0;
    runs.forEach((r, i) => {
      const first = k + 1;
      k += r.n;
      out.push({
        id: `soap_${i}`, pinned: true, type: 'chores', emoji: '🧴', time: m2t(r.start), duration: r.end - r.start,
        label: r.n > 1 ? `Liquid soap: batches ${first}–${k} of ${prefs.soapCount}` : `Liquid soap: batch ${first} of ${prefs.soapCount}`,
        note: `${r.n} × 1.5 h for Mum. Podcast or music on; stretch your back between batches.`,
      });
    });
    const placed = k;
    if (placed < prefs.soapCount) warnings.push(`Only ${placed} of ${prefs.soapCount} soap batches fit before bedtime.`);
  }

  // 2. Bath: earliest time it's warm enough (feels-like ≥ your minimum) and not likely raining,
  //    with the small-space workout right before it. No weather → mid-morning default.
  const pre = workoutMinutes;
  const candidates = [];
  for (let s = Math.max(dayStart + 30, 7 * 60); s <= 17 * 60; s += 30) {
    const from = s - pre;
    if (from < dayStart) continue;
    if (overlaps(from, s + BATH_MIN, [...busy, ...soft])) continue;
    const h = hourAt(weather, s);
    candidates.push({ s, feels: h?.feels ?? null, rain: h?.rain ?? 0 });
  }
  let bath = null;
  let why = '';
  if (candidates.length) {
    if (weather?.hours?.length) {
      const warm = candidates.find((c) => c.feels >= prefs.bathMinTemp && c.rain < 60);
      const warmest = [...candidates].sort((a, b) => b.feels - a.feels)[0];
      bath = warm || warmest;
      why = warm
        ? `${Math.round(bath.feels)}°C feels-like at ${m2t(bath.s)}, the earliest it's warm enough (≥${prefs.bathMinTemp}°C).`
        : `Cool day: ${m2t(bath.s)} is the warmest slot (${Math.round(bath.feels)}°C feels-like). Warm the water a little.`;
    } else {
      bath = candidates.find((c) => c.s >= 10 * 60) || candidates[0];
      why = 'Set your location for weather-based timing.';
    }
  }
  if (bath) {
    if (pre > 0) {
      out.push({ id: 'anchor_workout', pinned: true, type: 'workout', emoji: '🏠', time: m2t(bath.s - pre), duration: pre, label: 'Small-space workout', note: `${workoutNote} Right before your bath, so you only wash once.` });
      busy.push([bath.s - pre, bath.s]);
    }
    out.push({ id: 'anchor_bath', pinned: true, type: 'health', emoji: '🛁', time: m2t(bath.s), duration: BATH_MIN, label: 'Bath & fresh clothes', note: why });
    busy.push([bath.s, bath.s + BATH_MIN]);
  }

  // 3. Walk: comfortable, dry, ideally late afternoon (golden hour) or early morning.
  if (prefs.walk) {
    const sunset = weather?.sunset ? t2m(weather.sunset) : 18 * 60 + 40;
    let best = null;
    for (let s = Math.max(dayStart, 6 * 60 + 30); s + WALK_MIN <= Math.min(sunset, 19 * 60); s += 15) {
      if (overlaps(s, s + WALK_MIN, [...busy, ...soft])) continue;
      const h = hourAt(weather, s);
      const feels = h?.feels ?? 22;
      const rain = h?.rain ?? 0;
      if (rain >= 50) continue;
      let score = -Math.min(Math.abs(s - (sunset - 75)), Math.abs(s - 7 * 60)) / 60; // close to golden hour or early morning
      if (feels < 14 || feels > 29) score -= 3;
      if (rain < 20) score += 1;
      if (!best || score > best.score) best = { s, score, feels, rain };
    }
    if (best) {
      const ideas = prefs.walkIdeas.filter((a) => a.is_free || ['outdoor', 'relaxation', 'social'].includes(a.category));
      const pick = ideas.length ? ideas[new Date().getDate() % ideas.length] : null;
      const dest = pick ? `${pick.emoji || '📍'} ${pick.title}` : FALLBACK_WALKS[new Date().getDate() % FALLBACK_WALKS.length];
      out.push({
        id: 'anchor_walk', pinned: true, type: 'personal', emoji: '🚶', time: m2t(best.s), duration: WALK_MIN, label: 'Walk outside',
        note: `${dest}.${weather?.hours?.length ? ` ${Math.round(best.feels)}°C, ${best.rain}% rain chance.` : ''} Leave the scrolling at home; pick a place in Activities.`,
      });
    }
  }
  out.warnings = warnings;
  return out;
}
