// lib/byte-voice.js — plays Professor Byte's voice. Neural voice from /api/byte-voice (Orpheus on Groq), sent in
// sentence-sized chunks with the next one fetched while the current one plays, and a live loudness level so his
// mouth moves with the real sound. If the neural voice is busy or down, the phone's own voice takes over
// (a male one where the phone has it, pitched down otherwise) and Luxe retries neural after two minutes.
import { speak, stopSpeaking, pickByteVoice } from './voice';

export const BYTE_VOICES = [['troy', 'Troy'], ['austin', 'Austin'], ['daniel', 'Daniel'], ['phone', 'Phone voice'], ['off', 'Silent']];
const KEY = 'luxe_byte_voice';
export function getByteVoice() {
  try { const v = localStorage.getItem(KEY); if (v === 'on' || !v) return 'troy'; return BYTE_VOICES.some(([k]) => k === v) ? v : 'troy'; } catch { return 'troy'; }
}
export function setByteVoice(v) { try { localStorage.setItem(KEY, v); } catch { /* private mode */ } }

// Mood → how he says it (Orpheus vocal directions).
const TONE = { happy: 'cheerful', cheeky: 'cheerful', excited: 'excited', surprised: 'excited', proud: 'excited', thinking: 'calm', serious: 'professional', facepalm: 'dramatic', impatient: 'dramatic' };

let neuralDownUntil = 0;
const cache = new Map(); // text|voice|tone → Blob, last 40
function remember(k, blob) { cache.set(k, blob); if (cache.size > 40) cache.delete(cache.keys().next().value); }

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

async function fetchChunk(text, voice, tone, signal) {
  const k = `${voice}|${tone}|${text}`;
  if (cache.has(k)) return cache.get(k);
  const r = await fetch('/api/byte-voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice, tone }), signal });
  if (!r.ok) throw Object.assign(new Error('voice ' + r.status), { status: r.status });
  const blob = await r.blob();
  remember(k, blob);
  return blob;
}

let ac = null;
function audioCtx() {
  try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume().catch(() => {}); return ac; } catch { return null; }
}

// Speaks a line. Returns { stop }. onLevel(0..1) gives mouth movement; onStart fires when sound begins.
export function speakByte(text, { mood = 'happy', voice = getByteVoice(), onStart, onEnd, onLevel } = {}) {
  let stopped = false, ended = false, audio = null, raf = 0;
  const ctrl = new AbortController();
  const finish = () => { if (ended) return; ended = true; cancelAnimationFrame(raf); onLevel?.(0); onEnd?.(); };
  const stop = () => { stopped = true; ctrl.abort(); try { audio?.pause(); } catch { /* none */ } stopSpeaking(); cancelAnimationFrame(raf); onLevel?.(0); };

  const phone = () => {
    if (stopped) return;
    const v = pickByteVoice();
    const male = v && /\bmale\b|daniel|david|george|guy|ryan|thomas|fred|alex\b|rishi|aaron|arthur|oliver|gbb|gbd|iom|tpd|rjs/i.test(`${v.name} ${v.voiceURI || ''}`);
    let t = 0;
    speak(text, { voice: v, rate: 1.06, pitch: male ? 1.0 : 0.72, onStart: () => { onStart?.(); const tick = () => { if (stopped || ended) return; t += 1; onLevel?.(t % 6 < 1 ? 0 : 0.3 + Math.random() * 0.7); raf = requestAnimationFrame(() => setTimeout(tick, 80)); }; tick(); }, onEnd: () => { if (!stopped) finish(); } });
  };
  if (voice === 'off') { setTimeout(() => { if (!stopped) { onStart?.(); finish(); } }, 10); return { stop }; }
  if (voice === 'phone' || Date.now() < neuralDownUntil || typeof window === 'undefined') { phone(); return { stop }; }

  const tone = TONE[mood] || 'cheerful';
  const parts = chunks(text);
  const jobs = [];
  const get = (i) => { if (i < parts.length && !jobs[i]) jobs[i] = fetchChunk(parts[i], voice, tone, ctrl.signal); return jobs[i]; };
  let first = true;
  const playPart = async (i) => {
    if (stopped) return;
    if (i >= parts.length) { finish(); return; }
    let blob;
    try { blob = await get(i); get(i + 1); }
    catch (e) {
      if (stopped || e.name === 'AbortError') return;
      neuralDownUntil = Date.now() + 120000;
      // Say the rest with the phone voice.
      text = parts.slice(i).join(' '); phone(); return;
    }
    if (stopped) return;
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
    audio.onplay = () => { if (first) { first = false; onStart?.(); } meter(); };
    audio.onended = () => { URL.revokeObjectURL(url); cancelAnimationFrame(raf); playPart(i + 1); };
    audio.onerror = () => { URL.revokeObjectURL(url); playPart(i + 1); };
    audio.play().catch(() => { if (!stopped) { text = parts.slice(i).join(' '); phone(); } });
  };
  playPart(0);
  return { stop };
}
