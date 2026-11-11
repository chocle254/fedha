import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { streamUrl } from '../lib/audius';
import { videoFor, findArtist, related, artistTop, bpmFor } from '../lib/popular';
import { planMix, flowOrder, PRESETS } from '../lib/mix';
import { songRadio } from '../lib/music-mixes';
import { daypartNow, songKey } from '../lib/music-foryou';
import { Decks, speak, stopDjVoice } from '../lib/yt-decks';
import { warmByte } from '../lib/byte-voice';
import { getSetting, setSetting } from '../lib/db';

// One music player for the whole app (Music Room + the mini player on every page), so music keeps going while you
// move around Luxe. Two kinds of tracks:
//   indie (Audius)    an <audio> element through a bass chain in the browser (Theater / Max bass / Plain)
//   popular (YouTube) two YouTube players that MIX: the next song comes in over the end of this one. The style and
//                     length are picked automatically from both tempos (lib/mix.js), and the queue is ordered so
//                     neighbouring songs have close tempos (flowQueue below).
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
const readSound = () => { try { return localStorage.getItem('luxe_sound') || 'theater'; } catch { return 'theater'; } };

const SESSION = 'luxe_music_session';
const lean = ({ dj, smart, why, score, on, ...t }) => t;

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
  const [mixPlan, setMixPlan] = useState(null); // this song -> the next: { preset, bars, secs, from, to }
  const planRef = useRef(null);
  const [tracksPlayed, setTracksPlayed] = useState({}); // id -> { t, n, last }: On Repeat, Recently played
  const [sleepAt, setSleepAt] = useState(null); // ms timestamp, or 'end' (end of this song)
  const [skips, setSkips] = useState({ artists: {} }); // artists (and single songs) you skip early (For You sinks them)
  const [dayparts, setDayparts] = useState({}); // what you play at each time of day: { morning: { artist: n }, ... }
  const resumeAt = useRef(0); // seconds to start from the next time this track loads (restored session)
  const loadedId = useRef(null); // the track actually loaded into a player (null after a restore)
  const wasPlaying = useRef(false); // playing when the app went to the background
  const sleepRef = useRef(null);
  sleepRef.current = sleepAt;
  const track = idx >= 0 ? queue[idx] : null;
  state.current = { queue, idx, shuffle, track };

  useEffect(() => {
    setSoundState(readSound());
    getSetting('music_likes', []).then((l) => setLikes(Array.isArray(l) ? l : [])).catch(() => {});
    getSetting('music_plays', {}).then((p) => setPlays(p && typeof p === 'object' ? p : {})).catch(() => {});
    getSetting('music_tracks', {}).then((p) => setTracksPlayed(p && typeof p === 'object' ? p : {})).catch(() => {});
    getSetting('music_skips', { artists: {} }).then((p) => setSkips(p && p.artists ? p : { artists: {} })).catch(() => {});
    getSetting('music_dayparts', {}).then((p) => setDayparts(p && typeof p === 'object' ? p : {})).catch(() => {});
    // Pick up where you stopped: the queue, the song and the second (saved every few seconds, below).
    try {
      const ses = JSON.parse(localStorage.getItem(SESSION) || 'null');
      if (ses?.queue?.length && ses.idx >= 0 && ses.queue[ses.idx]) {
        setQueue(ses.queue); setIdx(ses.idx); state.current.queue = ses.queue;
        resumeAt.current = Number(ses.pos) || 0;
        setTime({ cur: resumeAt.current, dur: ses.queue[ses.idx].duration || 0 });
      }
    } catch { /* nothing saved */ }
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
    // The time of day too: what you want at 7 in the morning is not what you want at midnight (top 80 artists each).
    setDayparts((p) => {
      const part = daypartNow();
      const a = { ...(p[part] || {}), [t.artist]: ((p[part] || {})[t.artist] || 0) + 1 };
      const n = { ...p, [part]: Object.fromEntries(Object.entries(a).sort((x, y) => y[1] - x[1]).slice(0, 80)) };
      setSetting('music_dayparts', n).catch(() => {});
      return n;
    });
    setTracksPlayed((p) => {
      const { dj: _dj, smart: _s, ...lean } = t;
      const n = { ...p, [t.id]: { t: lean, n: (p[t.id]?.n || 0) + 1, last: Date.now() } };
      const trimmed = Object.fromEntries(Object.entries(n).sort((a, b) => b[1].last - a[1].last).slice(0, 400));
      setSetting('music_tracks', trimmed).catch(() => {});
      return trimmed;
    });
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
    const from = resumeAt.current; resumeAt.current = 0;
    setIdx(i); setDock(true); loadedId.current = t.id;
    if (t.source === 'yt') {
      audio.current?.pause();
      const d = ensureDecks(); if (!d) return;
      const vid = await videoFor(t);
      if (!vid) { if (tries < 6) { flash(`Couldn't find ${t.title} on YouTube. Next one.`); load(list, nextIndex(list, i), tries + 1); } return; }
      await d.play(vid, t.gain);
      if (from > 5) setTimeout(() => d.seek(from), 600);
      setDeck(d.active); setPlaying(true); if (!from) countPlay(t);
      const n = list[nextIndex(list, i)]; if (n?.source === 'yt') videoFor(n); // look the next one up early
      return;
    }
    decks.current?.pause();
    const a = audio.current; if (!a) return;
    ensureGraph(); applySound(readSound());
    if (graph.current?.ac.state === 'suspended') await graph.current.ac.resume().catch(() => {});
    a.src = streamUrl(t.id);
    if (from > 5) a.addEventListener('loadedmetadata', () => { a.currentTime = from; }, { once: true });
    await a.play().catch(() => {});
    if (!from) countPlay(t);
  }, [ensureDecks, ensureGraph, applySound, nextIndex, countPlay]);

  // Order the songs after the current one so each flows into the next (close tempos, no artist twice in a row).
  // Runs in the background once the tempos are in; skipped for DJ Luxe's sets (his lines follow his order) and
  // if the queue changed meanwhile (you added or removed a song).
  const flowQueue = useCallback(async (list, from) => {
    const rest = list.slice(from + 1, from + 41);
    if (rest.length < 3 || list.some((t) => t.dj)) return;
    const tempos = new Map();
    for (let k = 0; k < rest.length; k += 6) { // 6 at a time, gentle on Deezer
      const part = rest.slice(k, k + 6);
      const got = await Promise.all(part.map((t) => bpmFor(t)));
      part.forEach((t, j) => tempos.set(t.id, got[j]));
    }
    const start = await bpmFor(list[from]);
    if (state.current.queue !== list) return;
    const ordered = flowOrder(rest, start, list[from].artist, (t) => tempos.get(t.id) || null);
    const nl = [...list.slice(0, from + 1), ...ordered, ...list.slice(from + 41)];
    setQueue(nl); state.current.queue = nl;
  }, []);

  // Blend into the next YouTube song (with DJ Luxe's line over it if the set has one).
  const advance = useCallback(async (dir = 1, secs = null) => {
    const plan = planRef.current;
    const seconds = secs ?? (plan?.secs || 0);
    const curve = secs == null ? plan?.curve : PRESETS.fade.curve; // ⏭ is always a quick fade
    // Sleep timer "end of this song": stop instead of moving on.
    if (sleepRef.current === 'end' && dir > 0 && secs == null) { decks.current?.pause(); audio.current?.pause(); setSleepAt(null); sleepRef.current = null; return; }
    const { queue: list, idx: i } = state.current;
    // End of the queue: keep going with songs like the last one (Spotify's autoplay) instead of starting over.
    if (dir > 0 && !state.current.shuffle && i === list.length - 1 && list[i]) {
      try {
        const more = (await songRadio(list[i])).slice(1).filter((x) => !list.some((y) => y.id === x.id)).slice(0, 25);
        if (more.length) {
          const nl = [...list, ...more]; setQueue(nl); state.current.queue = nl; flash('Autoplay: more like this');
          load(nl, i + 1); flowQueue(nl, i + 1).catch(() => {}); return;
        }
      } catch { /* loop the queue then */ }
    }
    const n = nextIndex(list, i, dir); const t = list[n];
    if (!t) return;
    const d = decks.current;
    if (t.source === 'yt' && d && list[i]?.source === 'yt' && dir > 0 && seconds > 0) {
      const vid = await videoFor(t);
      if (!vid) { setIdx(n); return advance(1, seconds); }
      blending.current = true;
      // DJ Luxe only talks when the mood changes: over the blend into a new chapter, the music dipped under him.
      if (t.dj) speak(t.dj, { onStart: () => { ducking.current = 0.4; setDj((x) => ({ ...(x || {}), talking: true, text: t.dj })); }, onEnd: () => { ducking.current = 1; setDj((x) => (x ? { ...x, talking: false } : x)); } });
      setDeck(d.other); // show the incoming song as it fades in
      await d.blend(vid, t.gain, seconds, () => ducking.current, curve);
      blending.current = false;
      setIdx(n); countPlay(t);
      const after = list[nextIndex(list, n)]; if (after?.source === 'yt') videoFor(after);
      return;
    }
    load(list, n);
  }, [nextIndex, load, countPlay, flowQueue]);

  // Watch the YouTube clock: start the blend 8 s before the end.
  useEffect(() => {
    const iv = setInterval(() => {
      const { track: t } = state.current;
      if (typeof sleepRef.current === 'number' && Date.now() >= sleepRef.current) { decks.current?.pause(); audio.current?.pause(); sleepRef.current = null; setSleepAt(null); }
      if (t?.source !== 'yt' || !decks.current) return;
      const tm = decks.current.time();
      if (!document.hidden) { setTime({ cur: tm.cur, dur: tm.dur }); setPlaying(tm.playing || blending.current); } // screen off: no redraws
      const secs = planRef.current?.secs || 0;
      if (!blending.current && tm.playing && tm.dur > 30 && secs > 0 && tm.dur - tm.cur <= secs + 0.5) advance(1);
      if (ducking.current < 1 && !blending.current) decks.current.setDuck(ducking.current);
      else if (!blending.current && tm.playing) decks.current.setDuck(1);
    }, 500);
    return () => clearInterval(iv);
  }, [advance]);

  // Plan the transition from this song into the next (tempos from Deezer, then lib/mix.js).
  useEffect(() => {
    const { queue: list, idx: i } = state.current;
    // Shuffle picks the next song at the last moment, so the transition uses the default style without its tempo.
    const cur = list[i]; const nxt = state.current.shuffle ? null : list[(i + 1) % (list.length || 1)];
    if (!cur || cur.source !== 'yt' || (nxt && nxt.source !== 'yt')) { planRef.current = null; setMixPlan(null); return undefined; }
    let live = true;
    const set = (a, b) => { const p = { ...planMix(a, b), from: a, to: b }; planRef.current = p; if (live) setMixPlan(p); };
    set(cur, nxt);
    Promise.all([bpmFor(cur), nxt ? bpmFor(nxt) : null]).then(([x, y]) => { if (live) set({ ...cur, bpm: x }, nxt ? { ...nxt, bpm: y } : null); });
    return () => { live = false; };
  }, [idx, queue, shuffle]);

  // Last song in the queue: add more like it now (Spotify's autoplay), so it blends into the next one too.
  const topping = useRef(null);
  const djRef = useRef(null); // DJ Luxe's journey: { journey, chapter, name, mood, names: { chapter: name }, fetching }
  useEffect(() => {
    const { queue: list, idx: i, shuffle: sh } = state.current;
    const cur = list[i];
    if (djRef.current && cur?.chapter) return; // DJ Luxe adds his next chapter himself (below)
    if (sh || !cur || i !== list.length - 1 || cur.source !== 'yt' || topping.current === cur.id) return;
    topping.current = cur.id;
    songRadio(cur).then((r) => {
      const now = state.current.queue;
      if (now !== list) return;
      const more = r.slice(1).filter((x) => !now.some((y) => y.id === x.id)).slice(0, 25);
      if (!more.length) return;
      const nl = [...now, ...more]; setQueue(nl); state.current.queue = nl;
      flowQueue(nl, i).catch(() => {});
    }).catch(() => {});
  }, [idx, queue, shuffle, flowQueue]);

  // ── controls ───────────────────────────────────────────────────────────────
  const playList = useCallback((list, i = 0) => { setQueue(list); state.current.queue = list; load(list, i); flowQueue(list, i).catch(() => {}); }, [load, flowQueue]);
  const next = useCallback(() => {
    // Skipped in the first 30 s: For You learns you're not into this artist right now.
    const t = state.current.track;
    const cur = t?.source === 'yt' ? decks.current?.time()?.cur : audio.current?.currentTime;
    if (t?.artist && cur != null && cur < 30) {
      setSkips((p) => {
        const a = { ...(p.artists || {}), [t.artist]: ((p.artists || {})[t.artist] || 0) + 1 };
        // The song itself as well: one you keep skipping stops being suggested, even if you like the artist.
        const k = songKey(t); const tr = { ...(p.tracks || {}), [k]: ((p.tracks || {})[k] || 0) + 1 };
        const top = (o) => Object.fromEntries(Object.entries(o).sort((x, y) => y[1] - x[1]).slice(0, 300));
        const trimmed = { artists: top(a), tracks: top(tr) };
        setSetting('music_skips', trimmed).catch(() => {});
        return trimmed;
      });
    }
    advance(1, 2);
  }, [advance]);
  const prev = useCallback(() => {
    const { track: t, queue: list, idx: i } = state.current;
    if (t?.source === 'yt') { const tm = decks.current?.time(); if (tm && tm.cur > 5) { decks.current.seek(0); return; } }
    else if (audio.current && audio.current.currentTime > 5) { audio.current.currentTime = 0; return; }
    load(list, nextIndex(list, i, -1));
  }, [load, nextIndex]);
  const toggle = useCallback(async () => {
    const { track: t } = state.current; if (!t) return;
    if (loadedId.current !== t.id) { load(state.current.queue, state.current.idx); return; } // restored: start it from where you stopped
    if (t.source === 'yt') { decks.current?.toggle(); return; }
    const a = audio.current; if (!a) return;
    if (graph.current?.ac.state === 'suspended') await graph.current.ac.resume().catch(() => {});
    if (a.paused) a.play().catch(() => {}); else a.pause();
  }, [load]);
  const seek = useCallback((s) => {
    const t = state.current.track;
    if (t && loadedId.current !== t.id) { resumeAt.current = s; setTime((x) => ({ ...x, cur: s })); return; } // restored, not loaded yet
    if (t?.source === 'yt') decks.current?.seek(s); else if (audio.current) audio.current.currentTime = s;
  }, []);
  const like = useCallback(async (t) => {
    const has = likes.some((x) => x.id === t.id);
    const nextLikes = has ? likes.filter((x) => x.id !== t.id) : [{ ...t, dj: undefined, smart: undefined, liked_at: Date.now() }, ...likes].slice(0, 500);
    setLikes(nextLikes); await setSetting('music_likes', nextLikes);
  }, [likes]);

  // ✕ on the mini player: stop everything and hide it.
  const stop = useCallback(() => {
    decks.current?.pause(); audio.current?.pause();
    stopDjVoice(); ducking.current = 1;
    setDj(null); setIdx(-1); setQueue([]); state.current.queue = []; setPlaying(false);
    try { localStorage.removeItem(SESSION); } catch { /* private */ }
  }, []);

  // Queue (Spotify's Play next / Add to queue), song radio, crossfade, sleep timer.
  const playNext = useCallback((t) => {
    const { queue: list, idx: i } = state.current;
    if (i < 0) { playList([t], 0); return; }
    const n = [...list.slice(0, i + 1), { ...t, dj: null }, ...list.slice(i + 1)];
    setQueue(n); state.current.queue = n; flash(`Playing next: ${t.title}`);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const addToQueue = useCallback((t) => {
    const { queue: list, idx: i } = state.current;
    if (i < 0) { playList([t], 0); return; }
    const n = [...list, { ...t, dj: null }];
    setQueue(n); state.current.queue = n; flash(`Added to queue: ${t.title}`);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const startRadio = useCallback(async (t) => {
    flash(`${t.title} radio…`);
    try { const list = await songRadio(t); if (list.length) { setDj(null); setShuffle(false); playList(list, 0); } } catch { flash("Couldn't start that radio."); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const setSleep = useCallback((m) => { const v = m === 'end' ? 'end' : m ? Date.now() + m * 60e3 : null; setSleepAt(v); if (v) flash(m === 'end' ? 'Stopping after this song' : `Stopping in ${m} min`); }, []);
  const removeFromQueue = useCallback((k) => {
    const { queue: list, idx: i } = state.current;
    if (k === i) return;
    const n = list.filter((_, x) => x !== k);
    setQueue(n); state.current.queue = n; if (k < i) setIdx(i - 1);
  }, []);

  // Who you love most: likes count double, plays once.
  const topArtists = useCallback(() => {
    const score = { ...plays };
    for (const l of likes) if (l.artist) score[l.artist] = (score[l.artist] || 0) + 2;
    return Object.entries(score).sort((a, b) => b[1] - a[1]).map(([a]) => a).slice(0, 4);
  }, [plays, likes]);

  // DJ Luxe: a journey of moods, a chapter (~12 songs) at a time, an intro, and lines between songs.
  // opts: { mood, request, switchUp } (a string is treated as a mood, for older callers)
  const djAsk = useCallback(async (extra) => {
    const recent = [...state.current.queue.map((t) => t.id), ...Object.keys(tracksPlayed).slice(0, 40)].slice(-80);
    const r = await fetch('/api/music/dj', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ artists: topArtists().length ? topArtists() : ['Lil Wayne'], plays, recent, hour: new Date().getHours(), ...extra }) });
    const j = await r.json();
    if (!r.ok || !j.tracks?.length) throw new Error(j.error || 'No set');
    return j;
  }, [topArtists, plays, tracksPlayed]);
  const startDj = useCallback(async (opts = {}) => {
    const o = typeof opts === 'string' ? { mood: opts } : opts || {};
    setDj((x) => ({ ...(x || {}), on: true, loading: true, talking: false, text: o.switchUp ? 'Switching it up…' : o.request ? `Finding: ${o.request}` : o.mood ? `Building a ${o.mood} set…` : 'Building your set…' }));
    try {
      const j = await djAsk({ mood: o.mood || null, request: o.request || null, switchUp: !!o.switchUp, chapter: 1, journey: [] });
      djRef.current = { journey: j.journey || [], chapter: 1, name: j.name, mood: j.mood, names: { 1: { name: j.name, mood: j.mood } } };
      setDj({ on: true, loading: false, talking: true, text: j.intro, name: j.name, chapterMood: j.mood, journey: j.journey || [], why: j.why, mood: o.mood || null });
      setShuffle(false);
      speak(j.intro, { onStart: () => { ducking.current = 0.4; }, onEnd: () => { ducking.current = 1; setDj((x) => (x ? { ...x, talking: false } : x)); } });
      playList(j.tracks, 0);
    } catch (e) { djRef.current = null; setDj(null); flash(e.message || 'DJ Luxe is busy. Try again.'); }
  }, [djAsk, playList]);
  const stopDj = useCallback(() => { djRef.current = null; setDj(null); stopDjVoice(); ducking.current = 1; }, []);

  // Three songs before a chapter ends, DJ Luxe builds the next one (the next mood on the journey) and adds it, so
  // the set keeps going and blends into it. When a new chapter starts, the DJ card shows its name.
  useEffect(() => {
    const d = djRef.current; const { queue: list, idx: i } = state.current; const cur = list[i];
    if (!d || !cur?.chapter) return;
    const shown = d.names[cur.chapter];
    if (shown) setDj((x) => (x && x.name !== shown.name ? { ...x, name: shown.name, chapterMood: shown.mood } : x));
    if (d.fetching || i < list.length - 3) return;
    d.fetching = true;
    const last = d.names[d.chapter] || {};
    djAsk({ chapter: d.chapter + 1, journey: d.journey, prev: { name: last.name, mood: last.mood } }).then((j) => {
      if (djRef.current !== d) return; // DJ turned off or restarted meanwhile
      const now = state.current.queue;
      const more = j.tracks.filter((t) => !now.some((y) => y.id === t.id)).map((t) => ({ ...t, chapter: d.chapter + 1 }));
      d.chapter += 1; d.journey = j.journey || []; d.names[d.chapter] = { name: j.name, mood: j.mood };
      if (more.length) { const nl = [...now, ...more]; setQueue(nl); state.current.queue = nl; }
      if (more[0]?.dj) warmByte(more[0].dj, { persona: 'dj', voice: 'austin', mood: 'cheeky' }); // ready before the blend
      setDj((x) => (x ? { ...x, journey: d.journey, up: j.name } : x));
    }).catch(() => {}).finally(() => { d.fetching = false; });
  }, [idx, queue, djAsk]);

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

  // Save where you are every 5 s and when the app goes to the background, so it survives the app being closed.
  const saveSession = useCallback(() => {
    const { queue: list, idx: i, track: t } = state.current;
    if (!t || i < 0) return;
    const pos = t.source === 'yt' ? (decks.current?.time()?.cur ?? resumeAt.current) : (audio.current?.currentTime || resumeAt.current);
    const from = Math.max(0, i - 10);
    try { localStorage.setItem(SESSION, JSON.stringify({ queue: list.slice(from, i + 40).map(lean), idx: i - from, pos: loadedId.current === t.id ? pos : resumeAt.current, at: Date.now() })); } catch { /* full */ }
  }, []);
  useEffect(() => { const iv = setInterval(saveSession, 5000); return () => clearInterval(iv); }, [saveSession]);
  // Leaving the app pauses YouTube (Android stops video in the background). Coming back: play on from there.
  useEffect(() => {
    const vis = () => {
      const t = state.current.track;
      if (document.visibilityState === 'hidden') { wasPlaying.current = !!(t && (t.source === 'yt' ? decks.current?.time()?.playing : audio.current && !audio.current.paused)); saveSession(); return; }
      if (wasPlaying.current && t?.source === 'yt' && decks.current && !decks.current.time()?.playing) setTimeout(() => decks.current?.toggle(), 300);
      wasPlaying.current = false;
    };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('pagehide', saveSession);
    return () => { document.removeEventListener('visibilitychange', vis); window.removeEventListener('pagehide', saveSession); };
  }, [saveSession]);

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
    <Ctx.Provider value={{ queue, idx, track, playing, time, sound, setSound, shuffle, setShuffle, likes, like, playList, next, prev, toggle, seek, dj, startDj, stopDj, smartShuffle, note, topArtists, playNext, addToQueue, removeFromQueue, startRadio, mixPlan, sleepAt, setSleep, tracksPlayed, plays, skips, dayparts, stop }}>
      {children}
      {/* The YouTube decks: a small floating card while popular music plays (YouTube requires it to be visible). */}
      <div style={{ position: 'fixed', right: 16, bottom: 'calc(84px + env(safe-area-inset-bottom))', width: 88, height: 50, zIndex: 46, borderRadius: 10, overflow: 'hidden', opacity: yt ? 1 : 0, pointerEvents: 'none', background: '#000', transition: 'opacity 0.3s' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: deck === 0 ? 1 : 0, zIndex: deck === 0 ? 1 : 0, pointerEvents: deck === 0 ? 'auto' : 'none' }}><div ref={hostA} /></div>
        <div style={{ position: 'absolute', inset: 0, opacity: deck === 1 ? 1 : 0, zIndex: deck === 1 ? 1 : 0, pointerEvents: deck === 1 ? 'auto' : 'none' }}><div ref={hostB} /></div>
      </div>
      {note && <div style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(150px + env(safe-area-inset-bottom))', zIndex: 60, background: 'rgba(28,28,30,0.95)', color: '#f5f5f7', padding: '8px 14px', borderRadius: 999, fontSize: 13 }}>{note}</div>}
    </Ctx.Provider>
  );
}
