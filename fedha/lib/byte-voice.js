// lib/byte-voice.js — plays Professor Byte's voice. The neural voice comes from /api/byte-voice: NVIDIA Magpie by
// default (free, one steady voice all class), or ElevenLabs / Groq Orpheus (Troy, Austin, Daniel) if chosen. The text is sent in sentence-sized chunks with the next
// one fetched while the current one plays, plus a live loudness level so his mouth moves with the real sound.
// Only when every neural voice fails for a chunk does the phone's own voice say that one chunk, and the next chunk tries
// neural again. Two failures in a row rest the neural voice for 45 seconds.
import { speak, stopSpeaking, pickByteVoice } from './voice';

export const BYTE_VOICES = [['magpie', 'NVIDIA Magpie (free)'], ['auto', 'Auto'], ['eleven', 'ElevenLabs'], ['troy', 'Troy'], ['austin', 'Austin'], ['daniel', 'Daniel'], ['phone', 'Phone voice'], ['off', 'Silent']];
const KEY = 'luxe_byte_voice_v5'; // v5: Kokoro was removed and NVIDIA Magpie became the default, so everyone starts on Magpie
export function getByteVoice() {
  try { const v = localStorage.getItem(KEY); return BYTE_VOICES.some(([k]) => k === v) ? v : 'magpie'; } catch { return 'magpie'; }
}
export function setByteVoice(v) { try { localStorage.setItem(KEY, v); } catch { /* private mode */ } }

// Which voice actually answered last: 'magpie', 'eleven', 'troy', 'austin', 'daniel', or 'phone'.
let lastWho = '';
let lastWhy = ''; // why ElevenLabs didn't answer, when it didn't
export const byteVoiceInfo = () => lastWho;
export const byteVoiceWhy = () => lastWhy;

// Mood → how he says it (Orpheus vocal directions).
const TONE = { happy: 'cheerful', cheeky: 'cheerful', excited: 'excited', surprised: 'excited', proud: 'excited', thinking: 'calm', serious: 'professional', facepalm: 'dramatic', impatient: 'dramatic' };

let neuralDownUntil = 0;
const cache = new Map(); // text|voice|tone → Blob, last 60
function remember(k, blob) { cache.set(k, blob); if (cache.size > 60) cache.delete(cache.keys().next().value); }

// Splits into chunks of at most ~180 characters at sentence, then comma, then word breaks.
export function chunks(text, max = 180) {
  const out = [];
  const sentences = String(text).replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]*\s*/g) || [];
  let buf = '';
  const push = (s) => { if (s.trim()) out.push(s.trim()); };
  for (const s of sentences) {
    if ((buf + s).length <= max) { buf += s; continue; }
    push(buf); buf = '';
    if (s.length <= max) { buf = s; continue; }
    let rest = s;
    while (rest.length > max) {
      let cut = rest.lastIndexOf(',', max); if (cut < 60) cut = rest.lastIndexOf(' ', max); if (cut < 30) cut = max;
      push(rest.slice(0, cut + 1)); rest = rest.slice(cut + 1);
    }
    buf = rest;
  }
  push(buf);
  return out;
}

// ElevenLabs' free plan allows 2 requests at once, so never run more than 2 voice fetches together.
let running = 0;
const waiting = [];
// The line being spoken goes to the front of the queue, ahead of lines being got ready for later.
const gate = (fn, urgent = false) => new Promise((resolve, reject) => {
  const go = () => { running += 1; fn().then(resolve, reject).finally(() => { running -= 1; waiting.shift()?.(); }); };
  if (running < 2) go(); else if (urgent) waiting.unshift(go); else waiting.push(go);
});
const inflight = new Map(); // the same chunk asked for twice (warm-up + playback) is fetched once

function fetchChunk(text, voice, tone, signal, persona = null, urgent = false) {
  const k = `${persona || ''}|${voice}|${tone}|${text}`;
  if (cache.has(k)) return Promise.resolve(cache.get(k));
  if (inflight.has(k)) return inflight.get(k);
  const job = gate(async () => {
    const r = await fetch('/api/byte-voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice, tone, persona }), signal });
    lastWhy = r.headers.get('x-byte-why') || '';
    if (!r.ok) throw Object.assign(new Error('voice ' + r.status), { status: r.status });
    lastWho = r.headers.get('x-byte-voice') || lastWho;
    const blob = await r.blob();
    remember(k, blob);
    return blob;
  }, urgent).finally(() => inflight.delete(k));
  inflight.set(k, job);
  return job;
}

// Kept so callers don't break: there is no voice engine to wake any more (Kokoro was removed).
export function wakeByte() {}

// Gets the first two chunks of a line ready while the one before it is still playing, so there is no gap between lines.
export function warmByte(text, { mood = 'happy', voice = getByteVoice(), persona = null, first = 4 } = {}) {
  if (typeof window === 'undefined' || !text || voice === 'off' || voice === 'phone' || Date.now() < neuralDownUntil) return;
  const tone = TONE[mood] || 'cheerful';
  chunks(text).slice(0, first).forEach((c) => { fetchChunk(c, voice, tone, undefined, persona).catch(() => {}); });
}

let ac = null;
function audioCtx() {
  try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume().catch(() => {}); return ac; } catch { return null; }
}

// Loudness of a voice clip every 50 ms (0..1), for the mouth. Decoded once off to the side; null if it can't be.
const ENV_STEP = 0.05;
const envCache = new WeakMap();
async function envelope(blob) {
  if (envCache.has(blob)) return envCache.get(blob);
  try {
    const ctx = audioCtx(); if (!ctx) return null;
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const data = buf.getChannelData(0); const step = Math.floor(buf.sampleRate * ENV_STEP);
    const out = [];
    for (let i = 0; i < data.length; i += step) {
      let sum = 0; const end = Math.min(data.length, i + step);
      for (let k = i; k < end; k += 4) sum += data[k] * data[k];
      out.push(Math.min(1, Math.sqrt(sum / ((end - i) / 4)) * 5));
    }
    envCache.set(blob, out);
    return out;
  } catch { return null; }
}

// Speaks a line. Returns { stop }. onLevel(0..1) gives mouth movement; onStart fires when sound begins.
// persona 'dj' = DJ Luxe's own voice (pages/api/byte-voice.js).
// One voice at a time. A new line from the same speaker silences his last one (even one still loading, which used
// to start late and talk over the next line). Professor Byte has the floor over DJ Luxe: the DJ is cut off when
// Byte starts, and stays quiet while Byte is teaching.
const live = { byte: null, dj: null };
let byteLast = 0; // when Byte last made a sound or finished a line
export const byteIsTalking = () => !!live.byte || Date.now() - byteLast < 4000;

export function speakByte(text, { mood = 'happy', voice = getByteVoice(), persona = null, onStart, onEnd, onLevel } = {}) {
  let stopped = false, ended = false, audio = null, raf = 0, started = false, fails = 0, onPhone = false;
  const who = persona === 'dj' ? 'dj' : 'byte';
  const ctrl = new AbortController();
  const me = {};
  const release = () => { if (live[who] === me) live[who] = null; if (who === 'byte') byteLast = Date.now(); };
  const begin = () => { if (!started) { started = true; onStart?.(); } };
  const finish = () => { if (ended) return; ended = true; release(); cancelAnimationFrame(raf); onLevel?.(0); onEnd?.(); };
  const stop = () => { stopped = true; release(); ctrl.abort(); try { audio?.pause(); } catch { /* none */ } if (onPhone) stopSpeaking(); cancelAnimationFrame(raf); onLevel?.(0); };
  me.stop = stop; me.finish = finish;
  if (who === 'dj' && voice !== 'off' && byteIsTalking()) { setTimeout(finish, 10); return { stop }; } // Byte is teaching: the DJ skips this line
  live[who]?.stop();
  if (who === 'byte' && live.dj) { const dj = live.dj; dj.stop(); dj.finish(); } // ends the DJ's line properly, so the music comes back up
  if (voice !== 'off') live[who] = me;

  // The phone's own voice, for a piece of the line (or all of it). Calls then() when that piece is done.
  const phone = (t, then) => {
    if (stopped) return;
    lastWho = 'phone'; onPhone = true;
    const v = pickByteVoice();
    const male = v && /\bmale\b|daniel|david|george|guy|ryan|thomas|fred|alex\b|rishi|aaron|arthur|oliver|gbb|gbd|iom|tpd|rjs/i.test(`${v.name} ${v.voiceURI || ''}`);
    let busy = true;
    const tick = () => { if (stopped || ended || !busy) return; onLevel?.(Math.random() < 0.15 ? 0 : 0.3 + Math.random() * 0.7); raf = requestAnimationFrame(() => setTimeout(tick, 80)); };
    let over = false; // the phone reports the end of a line more than once on some phones
    speak(t, { voice: v, rate: 1.06, pitch: male ? 1.0 : 0.72, onStart: () => { begin(); tick(); }, onEnd: () => { if (over) return; over = true; busy = false; cancelAnimationFrame(raf); if (!stopped) then(); } });
  };
  if (voice === 'off') { setTimeout(() => { if (!stopped) { onStart?.(); finish(); } }, 10); return { stop }; }
  if (voice === 'phone' || Date.now() < neuralDownUntil || typeof window === 'undefined') { phone(text, finish); return { stop }; }

  const tone = TONE[mood] || 'cheerful';
  const parts = chunks(text);
  const jobs = [];
  const get = (i) => { if (i < parts.length && !jobs[i]) jobs[i] = fetchChunk(parts[i], voice, tone, ctrl.signal, persona, true); return jobs[i]; };
  const playPart = async (i) => {
    if (stopped) return;
    if (i >= parts.length) { finish(); return; }
    // Every neural voice failed for this chunk: the phone says just this chunk, then neural gets another go.
    let rescued = false;
    const rescue = () => {
      if (rescued || stopped) return; // a clip that fails reports it twice (the element and play()): one rescue
      rescued = true;
      fails += 1;
      if (fails >= 2) neuralDownUntil = Date.now() + 45000;
      phone(parts[i], () => playPart(i + 1));
    };
    if (Date.now() < neuralDownUntil) { rescue(); return; }
    let blob;
    try { blob = await get(i); get(i + 1); }
    catch (e) {
      if (stopped || e.name === 'AbortError') return;
      jobs[i] = null; // one retry before giving up on this chunk
      try { await new Promise((r) => setTimeout(r, 600)); if (stopped) return; blob = await get(i); get(i + 1); }
      catch (e2) { if (stopped || e2.name === 'AbortError') return; rescue(); return; }
    }
    if (stopped) return;
    fails = 0;
    const url = URL.createObjectURL(blob);
    audio = new Audio(url);
    // The voice plays straight from the audio element (not through Web Audio): routing it through an analyser
    // made it crackle on mid-range phones when the screen was busy. The mouth follows a loudness map measured
    // from the clip before it plays, read 20 times a second (and only sent on when it changes).
    const env = onLevel ? await envelope(blob) : null;
    if (stopped) { URL.revokeObjectURL(url); return; }
    let tick = 0; let last = -1;
    const meter = () => {
      if (stopped || !env) return;
      const k = Math.min(env.length - 1, Math.floor(audio.currentTime / ENV_STEP));
      const v = env[k] || 0;
      if (Math.abs(v - last) > 0.06) { last = v; onLevel(v); }
      tick = setTimeout(meter, 50);
    };
    audio.onplay = () => { begin(); meter(); };
    audio.onended = () => { URL.revokeObjectURL(url); clearTimeout(tick); onLevel?.(0); if (!rescued) playPart(i + 1); };
    audio.onerror = () => { URL.revokeObjectURL(url); clearTimeout(tick); rescue(); };
    audio.play().catch(() => { if (!stopped) rescue(); });
  };
  playPart(0);
  return { stop };
}
