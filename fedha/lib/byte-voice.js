// lib/byte-voice.js — plays Professor Byte's voice. The neural voice comes from /api/byte-voice, which tries
// ElevenLabs first, then Groq Orpheus (Troy, Austin, Daniel). The text is sent in sentence-sized chunks with the next
// one fetched while the current one plays, plus a live loudness level so his mouth moves with the real sound.
// Only when every neural voice fails for a chunk does the phone's own voice say that one chunk, and the next chunk tries
// neural again. Two failures in a row rest the neural voice for 45 seconds.
import { speak, stopSpeaking, pickByteVoice } from './voice';

export const BYTE_VOICES = [['auto', 'Auto'], ['eleven', 'ElevenLabs'], ['troy', 'Troy'], ['austin', 'Austin'], ['daniel', 'Daniel'], ['phone', 'Phone voice'], ['off', 'Silent']];
const KEY = 'luxe_byte_voice_v2';
export function getByteVoice() {
  try { const v = localStorage.getItem(KEY); return BYTE_VOICES.some(([k]) => k === v) ? v : 'auto'; } catch { return 'auto'; }
}
export function setByteVoice(v) { try { localStorage.setItem(KEY, v); } catch { /* private mode */ } }

// Which voice actually answered last: 'eleven', 'troy', 'austin', 'daniel', or 'phone'.
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
const gate = (fn) => new Promise((resolve, reject) => {
  const go = () => { running += 1; fn().then(resolve, reject).finally(() => { running -= 1; waiting.shift()?.(); }); };
  if (running < 2) go(); else waiting.push(go);
});
const inflight = new Map(); // the same chunk asked for twice (warm-up + playback) is fetched once

function fetchChunk(text, voice, tone, signal) {
  const k = `${voice}|${tone}|${text}`;
  if (cache.has(k)) return Promise.resolve(cache.get(k));
  if (inflight.has(k)) return inflight.get(k);
  const job = gate(async () => {
    const r = await fetch('/api/byte-voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice, tone }), signal });
    lastWhy = r.headers.get('x-byte-why') || '';
    if (!r.ok) throw Object.assign(new Error('voice ' + r.status), { status: r.status });
    lastWho = r.headers.get('x-byte-voice') || lastWho;
    const blob = await r.blob();
    remember(k, blob);
    return blob;
  }).finally(() => inflight.delete(k));
  inflight.set(k, job);
  return job;
}

// Gets the first two chunks of a line ready while the one before it is still playing, so there is no gap between lines.
export function warmByte(text, { mood = 'happy', voice = getByteVoice() } = {}) {
  if (typeof window === 'undefined' || !text || voice === 'off' || voice === 'phone' || Date.now() < neuralDownUntil) return;
  const tone = TONE[mood] || 'cheerful';
  chunks(text).slice(0, 2).forEach((c) => { fetchChunk(c, voice, tone).catch(() => {}); });
}

let ac = null;
function audioCtx() {
  try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume().catch(() => {}); return ac; } catch { return null; }
}

// Speaks a line. Returns { stop }. onLevel(0..1) gives mouth movement; onStart fires when sound begins.
export function speakByte(text, { mood = 'happy', voice = getByteVoice(), onStart, onEnd, onLevel } = {}) {
  let stopped = false, ended = false, audio = null, raf = 0, started = false, fails = 0;
  const ctrl = new AbortController();
  const begin = () => { if (!started) { started = true; onStart?.(); } };
  const finish = () => { if (ended) return; ended = true; cancelAnimationFrame(raf); onLevel?.(0); onEnd?.(); };
  const stop = () => { stopped = true; ctrl.abort(); try { audio?.pause(); } catch { /* none */ } stopSpeaking(); cancelAnimationFrame(raf); onLevel?.(0); };

  // The phone's own voice, for a piece of the line (or all of it). Calls then() when that piece is done.
  const phone = (t, then) => {
    if (stopped) return;
    lastWho = 'phone';
    const v = pickByteVoice();
    const male = v && /\bmale\b|daniel|david|george|guy|ryan|thomas|fred|alex\b|rishi|aaron|arthur|oliver|gbb|gbd|iom|tpd|rjs/i.test(`${v.name} ${v.voiceURI || ''}`);
    let busy = true;
    const tick = () => { if (stopped || ended || !busy) return; onLevel?.(Math.random() < 0.15 ? 0 : 0.3 + Math.random() * 0.7); raf = requestAnimationFrame(() => setTimeout(tick, 80)); };
    speak(t, { voice: v, rate: 1.06, pitch: male ? 1.0 : 0.72, onStart: () => { begin(); tick(); }, onEnd: () => { busy = false; cancelAnimationFrame(raf); if (!stopped) then(); } });
  };
  if (voice === 'off') { setTimeout(() => { if (!stopped) { onStart?.(); finish(); } }, 10); return { stop }; }
  if (voice === 'phone' || Date.now() < neuralDownUntil || typeof window === 'undefined') { phone(text, finish); return { stop }; }

  const tone = TONE[mood] || 'cheerful';
  const parts = chunks(text);
  const jobs = [];
  const get = (i) => { if (i < parts.length && !jobs[i]) jobs[i] = fetchChunk(parts[i], voice, tone, ctrl.signal); return jobs[i]; };
  const playPart = async (i) => {
    if (stopped) return;
    if (i >= parts.length) { finish(); return; }
    // Every neural voice failed for this chunk: the phone says just this chunk, then neural gets another go.
    const rescue = () => {
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
    const ctx = audioCtx();
    let analyser = null, data = null;
    if (ctx && onLevel) {
      try { const src = ctx.createMediaElementSource(audio); analyser = ctx.createAnalyser(); analyser.fftSize = 512; src.connect(analyser); analyser.connect(ctx.destination); data = new Uint8Array(analyser.fftSize); } catch { analyser = null; }
    }
    const meter = () => {
      if (!analyser || stopped) return;
      analyser.getByteTimeDomainData(data);
      let sum = 0; for (let k = 0; k < data.length; k++) { const v = (data[k] - 128) / 128; sum += v * v; }
      onLevel(Math.min(1, Math.sqrt(sum / data.length) * 5));
      raf = requestAnimationFrame(meter);
    };
    audio.onplay = () => { begin(); meter(); };
    audio.onended = () => { URL.revokeObjectURL(url); cancelAnimationFrame(raf); playPart(i + 1); };
    audio.onerror = () => { URL.revokeObjectURL(url); cancelAnimationFrame(raf); rescue(); };
    audio.play().catch(() => { if (!stopped) rescue(); });
  };
  playPart(0);
  return { stop };
}
