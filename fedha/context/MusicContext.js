import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { streamUrl } from '../lib/audius';
import { videoFor, findArtist, related, artistTop } from '../lib/popular';
import { Decks, speak } from '../lib/yt-decks';
import { getSetting, setSetting } from '../lib/db';

// One music player for the whole app (Music Room + the mini player on every page), so music keeps going while you
// move around Luxe. Two kinds of tracks:
//   indie (Audius)    an <audio> element through a bass chain in the browser (Theater / Max bass / Plain)
//   popular (YouTube) two YouTube players that BLEND: the next song fades in over the last 8 s of this one.
//                     YouTube needs its player visible, so it sits in a small floating card while it plays.
//                     (YouTube's sound can't go through the bass chain; use the phone's own equaliser for it.)
// DJ Luxe (pages/api/music/dj.js) builds a set and talks between songs (the phone's voice, music dipped under it).
// Smart Shuffle mixes a ✨ recommendation into your likes every 3 songs.
const Ctx = createContext(null);
export const useMusic = () => useContext(Ctx) || {};

const MODES = {
  theater: { low: 7, punch: 4, mid: -1.5, air: 2.5, gain: 1.0 },
  max: { low: 12, punch: 7, mid: -3, air: 3, gain: 0.85 },
  off: { low: 0, punch: 0, mid: 0, air: 0, gain: 1 },
};
export const SOUND_LABEL = { theater: '🔊 Theater', max: '💥 Max bass', off: '🔈 Plain' };
const BLEND = 8;
const readSound = () => { try { return localStorage.getItem('luxe_sound') || 'theater'; } catch { return 'theater'; } };

export function MusicProvider({ children }) {
  const audio = useRef(null);
  const graph = useRef(null);
  const decks = useRef(null);
  const hostA = useRef(null);
  const hostB = useRef(null);
  const blending = useRef(false);
  const ducking = useRef(1);
  const state = useRef({});
  const [queue, setQueue] = useState([]);
  const [idx, setIdx] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState({ cur: 0, dur: 0 });
  const [sound, setSoundState] = useState('theater');
  const [shuffle, setShuffle] = useState(false);
  const [likes, setLikes] = useState([]);
  const [plays, setPlays] = useState({}); // artist -> count (for DJ Luxe's seeds)
  const [dj, setDj] = useState(null); // { on, talking, text }
  const [note, setNote] = useState('');
  const [dock, setDock] = useState(true);
  const [deck, setDeck] = useState(0); // which YouTube deck is showing
  const track = idx >= 0 ? queue[idx] : null;
  state.current = { queue, idx, shuffle, track };

  useEffect(() => {
    setSoundState(readSound());
    getSetting('music_likes', []).then((l) => setLikes(Array.isArray(l) ? l : [])).catch(() => {});
    getSetting('music_plays', {}).then((p) => setPlays(p && typeof p === 'object' ? p : {})).catch(() => {});
    const a = new Audio(); a.crossOrigin = 'anonymous'; a.preload = 'auto'; audio.current = a;
    a.addEventListener('play', () => setPlaying(true));
    a.addEventListener('pause', () => setPlaying(false));
    a.addEventListener('timeupdate', () => { if (state.current.track?.source !== 'yt') setTime({ cur: a.currentTime, dur: a.duration || 0 }); });
    return () => { a.pause(); a.src = ''; };
  }, []);

  const flash = (t) => { setNote(t); setTimeout(() => setNote(''), 3500); };
  const countPlay = useCallback((t) => {
    if (!t?.artist) return;
    setPlays((p) => { const n = { ...p, [t.artist]: (p[t.artist] || 0) + 1 }; setSetting('music_plays', n).catch(() => {}); return n; });
  }, []);

  // ── indie: bass chain ──────────────────────────────────────────────────────
  const ensureGraph = useCallback(() => {
    if (graph.current || !audio.current) return graph.current;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; const ac = new AC();
      const src = ac.createMediaElementSource(audio.current);
      const low = ac.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 60;
      const punch = ac.createBiquadFilter(); punch.type = 'peaking'; punch.frequency.value = 120; punch.Q.value = 0.9;
      const mid = ac.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 900; mid.Q.value = 0.8;
      const air = ac.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 8000;
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.2;
      const gain = ac.createGain();
      src.connect(low).connect(punch).connect(mid).connect(air).connect(comp).connect(gain).connect(ac.destination);
      graph.current = { ac, low, punch, mid, air, gain };
    } catch { graph.current = null; }
    return graph.current;
  }, []);
  const applySound = useCallback((mode) => {
    const g = graph.current; if (!g) return;
    const m = MODES[mode] || MODES.theater; const t = g.ac.currentTime;
    g.low.gain.setTargetAtTime(m.low, t, 0.05); g.punch.gain.setTargetAtTime(m.punch, t, 0.05);
    g.mid.gain.setTargetAtTime(m.mid, t, 0.05); g.air.gain.setTargetAtTime(m.air, t, 0.05); g.gain.gain.setTargetAtTime(m.gain, t, 0.05);
  }, []);
  const setSound = useCallback((mode) => { setSoundState(mode); try { localStorage.setItem('luxe_sound', mode); } catch { /* ignore */ } applySound(mode); }, [applySound]);

  // ── popular: YouTube decks ─────────────────────────────────────────────────
  const ensureDecks = useCallback(() => {
    if (!decks.current && hostA.current && hostB.current) {
      decks.current = new Decks(hostA.current, hostB.current, {
        onEnded: () => { if (!blending.current) advance(1); }, // eslint-disable-line no-use-before-define
        onError: () => { flash('That video would not play. Skipping.'); advance(1); }, // eslint-disable-line no-use-before-define
      });
    }
    return decks.current;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Next playable index from `from` (skips songs YouTube doesn't have).
  const nextIndex = useCallback((list, from, dir = 1) => {
    if (!list.length) return -1;
    if (state.current.shuffle && dir > 0) return Math.floor(Math.random() * list.length);
    return (from + dir + list.length) % list.length;
  }, []);

  const load = useCallback(async (list, i, tries = 0) => {
    const t = list[i]; if (!t) return;
    setIdx(i); setDock(true);
    if (t.source === 'yt') {
      audio.current?.pause();
      const d = ensureDecks(); if (!d) return;
      const vid = await videoFor(t);
      if (!vid) { if (tries < 6) { flash(`Couldn't find ${t.title} on YouTube. Next one.`); load(list, nextIndex(list, i), tries + 1); } return; }
      await d.play(vid, t.gain);
      setDeck(d.active); setPlaying(true); countPlay(t);
      const n = list[nextIndex(list, i)]; if (n?.source === 'yt') videoFor(n); // look the next one up early
      return;
    }
    decks.current?.pause();
    const a = audio.current; if (!a) return;
    ensureGraph(); applySound(readSound());
    if (graph.current?.ac.state === 'suspended') await graph.current.ac.resume().catch(() => {});
    a.src = streamUrl(t.id);
    await a.play().catch(() => {});
    countPlay(t);
  }, [ensureDecks, ensureGraph, applySound, nextIndex, countPlay]);

  // Blend into the next YouTube song (with DJ Luxe's line over it if the set has one).
  const advance = useCallback(async (dir = 1, seconds = BLEND) => {
    const { queue: list, idx: i } = state.current;
    const n = nextIndex(list, i, dir); const t = list[n];
    if (!t) return;
    const d = decks.current;
    if (t.source === 'yt' && d && list[i]?.source === 'yt' && dir > 0) {
      const vid = await videoFor(t);
      if (!vid) { setIdx(n); return advance(1, seconds); }
      blending.current = true;
      if (t.dj) speak(t.dj, { onStart: () => { ducking.current = 0.35; setDj((x) => ({ ...(x || {}), talking: true, text: t.dj })); }, onEnd: () => { ducking.current = 1; setDj((x) => (x ? { ...x, talking: false } : x)); } });
      setDeck(d.other); // show the incoming song as it fades in
      await d.blend(vid, t.gain, seconds, () => ducking.current);
      blending.current = false;
      setIdx(n); countPlay(t);
      const after = list[nextIndex(list, n)]; if (after?.source === 'yt') videoFor(after);
      return;
    }
    load(list, n);
  }, [nextIndex, load, countPlay]);

  // Watch the YouTube clock: start the blend 8 s before the end.
  useEffect(() => {
    const iv = setInterval(() => {
      const { track: t } = state.current;
      if (t?.source !== 'yt' || !decks.current) return;
      const tm = decks.current.time();
      setTime({ cur: tm.cur, dur: tm.dur }); setPlaying(tm.playing || blending.current);
      if (!blending.current && tm.playing && tm.dur > 30 && tm.dur - tm.cur <= BLEND + 0.5) advance(1);
      if (ducking.current < 1 && !blending.current) decks.current.setDuck(ducking.current);
      else if (!blending.current && tm.playing) decks.current.setDuck(1);
    }, 500);
    return () => clearInterval(iv);
  }, [advance]);

  // ── controls ───────────────────────────────────────────────────────────────
  const playList = useCallback((list, i = 0) => { setQueue(list); state.current.queue = list; load(list, i); }, [load]);
  const next = useCallback(() => advance(1, 2), [advance]);
  const prev = useCallback(() => {
    const { track: t, queue: list, idx: i } = state.current;
    if (t?.source === 'yt') { const tm = decks.current?.time(); if (tm && tm.cur > 5) { decks.current.seek(0); return; } }
    else if (audio.current && audio.current.currentTime > 5) { audio.current.currentTime = 0; return; }
    load(list, nextIndex(list, i, -1));
  }, [load, nextIndex]);
  const toggle = useCallback(async () => {
    const { track: t } = state.current; if (!t) return;
    if (t.source === 'yt') { decks.current?.toggle(); return; }
    const a = audio.current; if (!a) return;
    if (graph.current?.ac.state === 'suspended') await graph.current.ac.resume().catch(() => {});
    if (a.paused) a.play().catch(() => {}); else a.pause();
  }, []);
  const seek = useCallback((s) => { if (state.current.track?.source === 'yt') decks.current?.seek(s); else if (audio.current) audio.current.currentTime = s; }, []);
  const like = useCallback(async (t) => {
    const has = likes.some((x) => x.id === t.id);
    const nextLikes = has ? likes.filter((x) => x.id !== t.id) : [{ ...t, dj: undefined, smart: undefined, liked_at: Date.now() }, ...likes].slice(0, 500);
    setLikes(nextLikes); await setSetting('music_likes', nextLikes);
  }, [likes]);

  // Who you love most: likes count double, plays once.
  const topArtists = useCallback(() => {
    const score = { ...plays };
    for (const l of likes) if (l.artist) score[l.artist] = (score[l.artist] || 0) + 2;
    return Object.entries(score).sort((a, b) => b[1] - a[1]).map(([a]) => a).slice(0, 4);
  }, [plays, likes]);

  // DJ Luxe: a fresh set, an intro, and lines between songs.
  const startDj = useCallback(async (mood = null) => {
    setDj({ on: true, loading: true, talking: false, text: '' });
    try {
      const recent = state.current.queue.slice(-30).map((t) => t.id);
      const r = await fetch('/api/music/dj', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ artists: topArtists().length ? topArtists() : ['Lil Wayne'], recent, mood }) });
      const j = await r.json();
      if (!r.ok || !j.tracks?.length) throw new Error(j.error || 'No set');
      setDj({ on: true, loading: false, talking: true, text: j.intro, seeds: j.seeds });
      setShuffle(false);
      speak(j.intro, { onEnd: () => setDj((x) => (x ? { ...x, talking: false } : x)) });
      playList(j.tracks, 0);
    } catch (e) { setDj(null); flash(e.message || 'DJ Luxe is busy. Try again.'); }
  }, [topArtists, playList]);
  const stopDj = useCallback(() => { setDj(null); try { window.speechSynthesis?.cancel(); } catch { /* none */ } }, []);

  // Smart Shuffle: your likes, shuffled, with a ✨ song from the artists around them every 3 tracks.
  const smartShuffle = useCallback(async () => {
    const base = [...likes].sort(() => Math.random() - 0.5);
    if (!base.length) { flash('Like a few songs first: Smart Shuffle mixes in songs like them.'); return; }
    let extra = [];
    try {
      const fav = topArtists()[0];
      const a = fav ? await findArtist(fav) : null;
      if (a) {
        const circle = (await related(a.id, 8)).sort(() => Math.random() - 0.5).slice(0, 4);
        extra = (await Promise.all(circle.map((c) => artistTop(c.id, 5)))).flat().filter((t) => !likes.some((l) => l.title === t.title && l.artist === t.artist)).sort(() => Math.random() - 0.5);
      }
    } catch { /* plain shuffle then */ }
    const mixed = [];
    base.forEach((t, i) => { mixed.push(t); if (i % 3 === 2 && extra.length) mixed.push({ ...extra.shift(), smart: true }); });
    stopDj(); setShuffle(false); playList(mixed, 0);
  }, [likes, topArtists, playList, stopDj]);

  // Lock screen and headset buttons.
  useEffect(() => {
    if (!track || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new window.MediaMetadata({ title: track.title, artist: track.artist, album: dj?.on ? 'DJ Luxe' : 'Luxe Music Room', artwork: track.artBig ? [{ src: track.artBig, sizes: '1000x1000', type: 'image/jpeg' }] : [] });
    navigator.mediaSession.setActionHandler('play', toggle);
    navigator.mediaSession.setActionHandler('pause', toggle);
    navigator.mediaSession.setActionHandler('nexttrack', next);
    navigator.mediaSession.setActionHandler('previoustrack', prev);
  }, [track, toggle, next, prev, dj?.on]);

  // Indie tracks end on the <audio> element.
  useEffect(() => {
    const a = audio.current; if (!a) return undefined;
    const end = () => advance(1);
    a.addEventListener('ended', end);
    return () => a.removeEventListener('ended', end);
  }, [advance]);

  const yt = track?.source === 'yt';
  return (
    <Ctx.Provider value={{ queue, idx, track, playing, time, sound, setSound, shuffle, setShuffle, likes, like, playList, next, prev, toggle, seek, dj, startDj, stopDj, smartShuffle, note, topArtists }}>
      {children}
      {/* The YouTube decks: a small floating card while popular music plays (YouTube requires it to be visible). */}
      <div style={{ position: 'fixed', right: 10, bottom: 'calc(140px + env(safe-area-inset-bottom))', width: dock ? 200 : 1, height: dock ? 113 : 1, zIndex: 45, borderRadius: 12, overflow: 'hidden', boxShadow: yt && dock ? '0 10px 30px rgba(0,0,0,0.5)' : 'none', opacity: yt ? 1 : 0, pointerEvents: yt ? 'auto' : 'none', background: '#000', transition: 'opacity 0.3s' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: deck === 0 ? 1 : 0, zIndex: deck === 0 ? 1 : 0, pointerEvents: deck === 0 ? 'auto' : 'none' }}><div ref={hostA} /></div>
        <div style={{ position: 'absolute', inset: 0, opacity: deck === 1 ? 1 : 0, zIndex: deck === 1 ? 1 : 0, pointerEvents: deck === 1 ? 'auto' : 'none' }}><div ref={hostB} /></div>
        {yt && <button type="button" onClick={() => setDock((v) => !v)} aria-label="Hide video" style={{ position: 'absolute', top: 4, right: 4, zIndex: 2, width: 22, height: 22, borderRadius: '50%', border: 0, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 11 }}>{dock ? '–' : '+'}</button>}
      </div>
      {note && <div style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(150px + env(safe-area-inset-bottom))', zIndex: 60, background: 'rgba(28,28,30,0.95)', color: '#f5f5f7', padding: '8px 14px', borderRadius: 999, fontSize: 13 }}>{note}</div>}
    </Ctx.Provider>
  );
}
