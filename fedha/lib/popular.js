// Popular music for the Music Room: Deezer is the catalogue and the brain (search, artist top tracks, similar
// artists, artist radio, charts, loudness), YouTube plays the full song (pages/api/music/video.js finds it).
async function dz(path, params = {}) {
  const qs = new URLSearchParams({ path, ...params });
  const r = await fetch(`/api/music/deezer?${qs}`);
  if (!r.ok) throw new Error('Catalogue unavailable');
  return r.json();
}

export const fromDeezer = (t) => ({
  id: `dz:${t.id}`, dz: t.id, source: 'yt', title: t.title_short || t.title, artist: t.artist?.name || '', artistId: t.artist?.id || null,
  art: t.album?.cover_medium || t.album?.cover || null, artBig: t.album?.cover_xl || t.album?.cover_big || null,
  duration: t.duration || 0, gain: typeof t.gain === 'number' ? t.gain : null, rank: t.rank || 0, explicit: !!t.explicit_lyrics, preview: t.preview || null,
});
const tracks = (j) => (j?.data || []).filter((t) => t.readable !== false).map(fromDeezer);

export async function searchTracks(q) { return tracks(await dz('/search', { q, limit: 40 })); }
export async function findArtist(name) {
  const j = await dz('/search/artist', { q: name, limit: 5 });
  return (j?.data || []).sort((a, b) => (b.nb_fan || 0) - (a.nb_fan || 0))[0] || null; // the famous one, not a namesake
}
export async function artistTop(id, limit = 25) { return tracks(await dz(`/artist/${id}/top`, { limit })); }
export async function related(id, limit = 12) { return (await dz(`/artist/${id}/related`, { limit }))?.data || []; }
export async function artistRadio(id) { return tracks(await dz(`/artist/${id}/radio`, { limit: 40 })); }
export async function chart() { return tracks(await dz('/chart/0/tracks', { limit: 50 })); }

// Tempo for the Mix (lib/mix.js): Deezer's BPM for a track, null if it has none. Remembered for the session.
const bpmCache = new Map();
export async function bpmFor(t) {
  if (!t?.dz) return null;
  if (bpmCache.has(t.dz)) return bpmCache.get(t.dz);
  const p = dz(`/track/${t.dz}`).then((j) => (Number(j?.bpm) > 40 ? Math.round(Number(j.bpm)) : null)).catch(() => null);
  bpmCache.set(t.dz, p);
  const v = await p; bpmCache.set(t.dz, v); return v;
}

const videoCache = new Map();
// YouTube id for a track (null if none found). Remembered for the session; the server remembers it for good.
export async function videoFor(t) {
  if (videoCache.has(t.id)) return videoCache.get(t.id);
  const qs = new URLSearchParams({ artist: t.artist, title: t.title, key: t.id });
  const p = fetch(`/api/music/video?${qs}`).then((r) => (r.ok ? r.json() : {})).then((j) => j.id || null).catch(() => null);
  videoCache.set(t.id, p);
  return p;
}
