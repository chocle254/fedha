import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { streamUrl } from '../lib/audius';
import { getSetting, setSetting } from '../lib/db';

// One music player for the whole app (Music Room + the mini player on every page), so music keeps going while you
// move around Luxe. Sound runs through a bass chain in the browser:
//   low shelf 60 Hz → peak 120 Hz → mid cut 900 Hz → presence 8 kHz → compressor → gain
// with the same modes as the video player: Theater (default), Max bass, Plain (remembered on this phone).
// Lock-screen / headset controls through the Media Session API. Likes are the 'music_likes' setting.
const Ctx = createContext(null);
export const useMusic = () => useContext(Ctx) || {};

const MODES = {
  theater: { low: 7, punch: 4, mid: -1.5, air: 2.5, gain: 1.0 },
  max: { low: 12, punch: 7, mid: -3, air: 3, gain: 0.85 },
  off: { low: 0, punch: 0, mid: 0, air: 0, gain: 1 },
};
export const SOUND_LABEL = { theater: '🔊 Theater', max: '💥 Max bass', off: '🔈 Plain' };
const readSound = () => { try { return localStorage.getItem('luxe_sound') || 'theater'; } catch { return 'theater'; } };

export function MusicProvider({ children }) {
  const audio = useRef(null);
  const graph = useRef(null);
  const [queue, setQueue] = useState([]);
  const [idx, setIdx] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState({ cur: 0, dur: 0 });
  const [sound, setSoundState] = useState('theater');
  const [shuffle, setShuffle] = useState(false);
  const [likes, setLikes] = useState([]);
  const track = idx >= 0 ? queue[idx] : null;

  useEffect(() => {
    setSoundState(readSound());
    getSetting('music_likes', []).then((l) => setLikes(Array.isArray(l) ? l : [])).catch(() => {});
    const a = new Audio();
    a.crossOrigin = 'anonymous';
    a.preload = 'auto';
    audio.current = a;
    const on = (e, f) => a.addEventListener(e, f);
    on('play', () => setPlaying(true));
    on('pause', () => setPlaying(false));
    on('timeupdate', () => setTime({ cur: a.currentTime, dur: a.duration || 0 }));
    return () => { a.pause(); a.src = ''; };
  }, []);

  // Built on the first tap (browsers only allow audio processing after a user gesture).
  const ensureGraph = useCallback(() => {
    if (graph.current || !audio.current) return graph.current;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ac = new AC();
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
    const g = graph.current;
    if (!g) return;
    const m = MODES[mode] || MODES.theater;
    const t = g.ac.currentTime;
    g.low.gain.setTargetAtTime(m.low, t, 0.05); g.punch.gain.setTargetAtTime(m.punch, t, 0.05);
    g.mid.gain.setTargetAtTime(m.mid, t, 0.05); g.air.gain.setTargetAtTime(m.air, t, 0.05); g.gain.gain.setTargetAtTime(m.gain, t, 0.05);
  }, []);
  const setSound = useCallback((mode) => { setSoundState(mode); try { localStorage.setItem('luxe_sound', mode); } catch { /* ignore */ } applySound(mode); }, [applySound]);

  const load = useCallback(async (list, i) => {
    const a = audio.current;
    if (!a || !list[i]) return;
    ensureGraph(); applySound(readSound());
    if (graph.current?.ac.state === 'suspended') await graph.current.ac.resume().catch(() => {});
    a.src = streamUrl(list[i].id);
    setIdx(i);
    await a.play().catch(() => {});
  }, [ensureGraph, applySound]);

  const playList = useCallback((list, i = 0) => { setQueue(list); load(list, i); }, [load]);
  const next = useCallback(() => {
    if (!queue.length) return;
    const n = shuffle ? Math.floor(Math.random() * queue.length) : (idx + 1) % queue.length;
    load(queue, n);
  }, [queue, idx, shuffle, load]);
  const prev = useCallback(() => {
    const a = audio.current;
    if (a && a.currentTime > 5) { a.currentTime = 0; return; }
    if (queue.length) load(queue, (idx - 1 + queue.length) % queue.length);
  }, [queue, idx, load]);
  const toggle = useCallback(async () => {
    const a = audio.current; if (!a || !track) return;
    if (graph.current?.ac.state === 'suspended') await graph.current.ac.resume().catch(() => {});
    if (a.paused) a.play().catch(() => {}); else a.pause();
  }, [track]);
  const seek = useCallback((s) => { if (audio.current) audio.current.currentTime = s; }, []);
  const like = useCallback(async (t) => {
    const has = likes.some((x) => x.id === t.id);
    const nextLikes = has ? likes.filter((x) => x.id !== t.id) : [{ ...t, liked_at: Date.now() }, ...likes].slice(0, 300);
    setLikes(nextLikes); await setSetting('music_likes', nextLikes);
  }, [likes]);

  // Next track when one ends.
  useEffect(() => {
    const a = audio.current; if (!a) return undefined;
    const end = () => next();
    a.addEventListener('ended', end);
    return () => a.removeEventListener('ended', end);
  }, [next]);

  // Lock screen and headset buttons.
  useEffect(() => {
    if (!track || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new window.MediaMetadata({ title: track.title, artist: track.artist, album: 'Luxe Music Room', artwork: track.artBig ? [{ src: track.artBig, sizes: '1000x1000', type: 'image/jpeg' }] : [] });
    navigator.mediaSession.setActionHandler('play', toggle);
    navigator.mediaSession.setActionHandler('pause', toggle);
    navigator.mediaSession.setActionHandler('nexttrack', next);
    navigator.mediaSession.setActionHandler('previoustrack', prev);
  }, [track, toggle, next, prev]);

  return (
    <Ctx.Provider value={{ queue, idx, track, playing, time, sound, setSound, shuffle, setShuffle, likes, like, playList, next, prev, toggle, seek }}>
      {children}
    </Ctx.Provider>
  );
}
