// Spotify-style mixes for the Music Room, from Deezer (through /api/music/deezer) and your own listening:
//   Daily Mix 1-3   one per top artist: their songs + their circle
//   Release Radar   newest releases from your artists
//   On Repeat       your most played songs; Recently played
//   Song radio      start a radio from any song (its artist's radio + similar artists)
//   Lyrics          synced lyrics from LRCLIB (free, open)
import { findArtist, artistTop, related, artistRadio } from './popular';

async function dz(path, params = {}) {
  const r = await fetch(`/api/music/deezer?${new URLSearchParams({ path, ...params })}`);
  if (!r.ok) throw new Error('Catalogue unavailable');
  return r.json();
}
const mix = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [b[i], b[k]] = [b[k], b[i]]; } return b; };
const noRepeats = (list) => { const out = []; const rest = [...list]; while (rest.length) { const i = rest.findIndex((t) => t.artist !== out[out.length - 1]?.artist); out.push(...rest.splice(i >= 0 ? i : 0, 1)); } return out; };

export async function dailyMixes(artistNames) {
  const out = [];
  for (const [n, name] of artistNames.slice(0, 3).entries()) {
    try {
      const a = await findArtist(name); if (!a) continue;
      const [mine, circle] = await Promise.all([artistTop(a.id, 12), related(a.id, 6)]);
      const theirs = (await Promise.all(mix(circle).slice(0, 4).map((c) => artistTop(c.id, 4)))).flat();
      out.push({ name: `Daily Mix ${n + 1}`, sub: `${a.name}, ${circle.slice(0, 3).map((c) => c.name).join(', ')}`, cover: a.picture_big || a.picture_medium, tracks: noRepeats(mix([...mine, ...theirs])).slice(0, 30) });
    } catch { /* skip that mix */ }
  }
  return out;
}

export async function releaseRadar(artistNames) {
  const found = (await Promise.all(artistNames.slice(0, 5).map((n) => findArtist(n).catch(() => null)))).filter(Boolean);
  const albums = (await Promise.all(found.map((a) => dz(`/artist/${a.id}/albums`, { limit: 10 }).then((r) => (r.data || []).map((al) => ({ ...al, artistName: a.name }))).catch(() => [])))).flat();
  albums.sort((x, y) => String(y.release_date || '').localeCompare(String(x.release_date || '')));
  const latest = albums.slice(0, 8);
  const tracks = (await Promise.all(latest.map((al) => dz(`/album/${al.id}/tracks`, { limit: 3 }).then((r) => (r.data || []).slice(0, 2).map((t) => ({
    id: `dz:${t.id}`, dz: t.id, source: 'yt', title: t.title_short || t.title, artist: t.artist?.name || al.artistName, artistId: t.artist?.id || null,
    art: al.cover_medium, artBig: al.cover_xl || al.cover_big, duration: t.duration || 0, gain: typeof t.gain === 'number' ? t.gain : null, released: al.release_date,
  }))).catch(() => [])))).flat();
  return tracks;
}

export async function songRadio(t) {
  if (!t?.artistId) { const a = t?.artist ? await findArtist(t.artist) : null; if (!a) return []; t = { ...t, artistId: a.id }; }
  const [radio, circle] = await Promise.all([artistRadio(t.artistId), related(t.artistId, 6)]);
  const theirs = (await Promise.all(mix(circle).slice(0, 3).map((c) => artistTop(c.id, 4)))).flat();
  return [t, ...noRepeats(mix([...radio, ...theirs].filter((x) => x.id !== t.id))).slice(0, 29)];
}

// Synced lyrics: [{ at: seconds, text }] or plain lines, or null.
const lyricsCache = new Map();
export async function lyricsFor(t) {
  const key = `${t.artist}|${t.title}`;
  if (lyricsCache.has(key)) return lyricsCache.get(key);
  const p = (async () => {
    const clean = String(t.title).replace(/\s*\((feat|ft|with|album|explicit|remaster)[^)]*\)/gi, '').trim();
    const r = await fetch(`https://lrclib.net/api/get?${new URLSearchParams({ artist_name: t.artist, track_name: clean, ...(t.duration ? { duration: String(Math.round(t.duration)) } : {}) })}`);
    let d = r.ok ? await r.json() : null;
    if (!d) { const s = await fetch(`https://lrclib.net/api/search?${new URLSearchParams({ artist_name: t.artist, track_name: clean })}`); const list = s.ok ? await s.json() : []; d = list[0] || null; }
    if (!d) return null;
    if (d.syncedLyrics) {
      return d.syncedLyrics.split('\n').map((l) => { const m = l.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s?(.*)$/); return m ? { at: Number(m[1]) * 60 + Number(m[2]), text: m[3] } : null; }).filter(Boolean);
    }
    return d.plainLyrics ? d.plainLyrics.split('\n').map((text) => ({ at: null, text })) : null;
  })().catch(() => null);
  lyricsCache.set(key, p);
  return p;
}

// Spotify-style daylist name for right now.
export function daylistName(top) {
  const d = new Date(); const h = d.getHours();
  const day = d.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const part = h < 5 ? 'late night' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night';
  return `${day} ${part}${top ? ` ${top.toLowerCase()}` : ''}`;
}
