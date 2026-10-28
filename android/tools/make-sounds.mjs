// Generates the app's notification sounds (res/raw/*.wav). Run: node android/tools/make-sounds.mjs
//
// Sound palette: soothing, deep, futuristic, lo-fi, sweet.
//   - Electric piano (FM "Rhodes": warm body plus a glassy tine) playing jazz voicings (maj7, maj9, m7).
//   - Deep bass: an 808-style sine with a short pitch drop. Phone speakers cannot play real sub-bass, so the
//     bass is also saturated to add overtones; the ear rebuilds the low note from them ("missing fundamental").
//     On earbuds you get the real sub.
//   - Futuristic air: a slow-swelling detuned pad, a shimmer sparkle an octave up, a stereo ping-pong echo.
//   - Lo-fi: slight tape wow, warm low-pass, soft saturation and a whisper of vinyl crackle.
//
// Four sounds, shared by kind of news:
//   sound_success  "Aurora"     TP hit, NestLink withdrawal: sub thump, Dmaj9 rising, shimmer (keys an octave up for phone speakers)
//   sound_alert    "Low tide"   SL hit, UpesiPay low: Bm9 falling to Gmaj7 over a deep pulse
//   sound_gentle   "Droplet"    planner, Jarvis: water-drop blip into a soft A/E dyad
//   sound_entry    "Lift-off"   trade entered: sub drop, rising sweep, D then A
import { writeFileSync, readdirSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const RATE = 44100;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../app/src/main/res/raw');
const TAU = Math.PI * 2;
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const BPM = 84;
const EIGHTH = 60 / BPM / 2;

// Tape wow: a slow, tiny pitch drift shared by all tonal voices (phase offset form of FM).
const wow = (f, t) => (f * 0.0016 / 0.9) * Math.sin(TAU * 0.9 * t) + (f * 0.0006 / 5.3) * Math.sin(TAU * 5.3 * t);

// ─── VOICES: (f Hz, t s since note start, dur s) -> sample ───────────────────
function rhodes(f, t, dur) {
  const env = Math.min(1, t / 0.003) * Math.exp(-t * (2.2 / dur));
  const idx = 1.4 * Math.exp(-t * 4);
  const body = Math.sin(TAU * f * t + wow(f, t) + idx * Math.sin(TAU * f * t));
  const tine = 0.16 * Math.sin(TAU * f * 14 * t) * Math.exp(-t * 26);
  const bark = 0.1 * Math.sin(TAU * f * 2 * t + wow(f, t)) * Math.exp(-t * 6);
  return env * (body + tine + bark);
}

function sub(f, t, dur) {
  // 808: starts ~1.7x higher and drops to pitch in 45 ms, then a long smooth decay.
  const phase = TAU * f * (t + 0.7 * 0.015 * (1 - Math.exp(-t / 0.015))); // integral of f*drop
  const env = Math.min(1, t / 0.002) * Math.exp(-t * (3 / dur));
  const x = Math.sin(phase) * env;
  // Overtones that a phone speaker can play, so the bass is heard; clean sub stays underneath.
  return 0.75 * x + 0.45 * Math.tanh(3.5 * x);
}

function pad(f, t, dur) {
  const env = Math.min(1, t / (dur * 0.35)) * Math.exp(-Math.max(0, t - dur * 0.35) * (3 / dur));
  let v = 0;
  for (const d of [-0.006, 0, 0.0065]) {
    const ff = f * (1 + d);
    v += Math.sin(TAU * ff * t + wow(ff, t)) + 0.3 * Math.sin(TAU * 2 * ff * t) + 0.12 * Math.sin(TAU * 3 * ff * t);
  }
  return (env * v) / 3;
}

function sparkle(f, t, dur) {
  const env = Math.min(1, t / 0.004) * Math.exp(-t * (4 / dur));
  return env * (Math.sin(TAU * f * t + 0.8 * Math.sin(TAU * f * 3.01 * t) * Math.exp(-t * 5)) * 0.8 + 0.2 * Math.sin(TAU * f * 2 * t));
}

function droplet(f, t, dur) {
  // Pitch glides up an octave in 50 ms, like a water drop, with a quick fade.
  const k = 0.05;
  const phase = TAU * f * (t + (t < k ? (t * t) / (2 * k) : k / 2 + (t - k)));
  const env = Math.min(1, t / 0.002) * Math.exp(-t * (6 / dur));
  return env * Math.sin(phase);
}

function sweep(f, t, dur) {
  // Rising filtered whoosh: noise-like cluster of detuned partials whose brightness grows.
  const env = Math.sin(Math.PI * Math.min(1, t / dur)) ** 2;
  let v = 0;
  for (let i = 1; i <= 6; i++) v += Math.sin(TAU * f * i * (1 + 0.5 * t / dur) * t + i) / i * Math.min(1, (t / dur) * i * 0.6);
  return env * v * 0.5;
}

const VOICES = { rhodes, sub, pad, sparkle, droplet, sweep };

// ─── MIXING ──────────────────────────────────────────────────────────────────
// note: [voice, midi, start (s), dur (s), gain, pan -1..1]
function render(notes, { tail = 1.1, wet = 0.24, delay = 0.22, crackle = 0.004 } = {}) {
  const len = Math.ceil(RATE * (Math.max(...notes.map((n) => n[2] + n[3])) + tail));
  const L = new Float32Array(len);
  const R = new Float32Array(len);
  for (const [voice, midi, start, dur, gain, pan = 0] of notes) {
    const fn = VOICES[voice];
    const f = hz(midi);
    const s0 = Math.floor(start * RATE);
    const n = Math.min(len - s0, Math.floor((dur * 1.6 + 0.3) * RATE));
    const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
    const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      const v = fn(f, t, dur);
      L[s0 + i] += v * gl;
      R[s0 + i] += v * gr;
    }
  }
  pingPong(L, R, EIGHTH * 1.5, delay);
  const rl = reverb(L, 0);
  const rr = reverb(R, 23);
  const sl = shimmer(rl);
  const sr = shimmer(rr);
  for (let i = 0; i < len; i++) {
    L[i] = L[i] * (1 - wet) + (rl[i] + 0.25 * sl[i]) * wet;
    R[i] = R[i] * (1 - wet) + (rr[i] + 0.25 * sr[i]) * wet;
  }
  // Lo-fi: warm low-pass and a whisper of vinyl crackle.
  lowpass(L, 6200); lowpass(R, 6200);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < len; i++) {
    const hiss = (rnd() - 0.5) * crackle * 0.5;
    const pop = rnd() < 0.00025 ? (rnd() - 0.5) * crackle * 18 : 0;
    L[i] += hiss + pop; R[i] += hiss + pop * 0.6;
  }
  return master(L, R);
}

// Stereo ping-pong echo: repeats bounce left, right, left..., each one darker and quieter.
function pingPong(L, R, time, mix) {
  const d = Math.floor(time * RATE);
  const fb = 0.42;
  const n = L.length;
  const dl = new Float32Array(n);
  const dr = new Float32Array(n);
  let lp = 0;
  for (let i = d; i < n; i++) {
    lp += 0.3 * ((L[i - d] + R[i - d]) * 0.5 - lp);
    dl[i] = lp + dr[i - d] * fb;
    dr[i] = dl[i - d] * fb;
  }
  for (let i = 0; i < n; i++) { L[i] += dl[i] * mix; R[i] += dr[i] * mix; }
}

function lowpass(x, cutoff) {
  const a = 1 - Math.exp((-TAU * cutoff) / RATE);
  let y = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); y2 += a * (y - y2); x[i] = y2; } // 2-pole, smoother
}

// Freeverb-style room: 4 damped combs in parallel, then 2 all-passes. `spread` decorrelates left and right.
function reverb(x, spread) {
  const out = new Float32Array(x.length);
  for (const d of [1557, 1617, 1491, 1422]) {
    const size = Math.floor(d + spread);
    const buf = new Float32Array(size);
    let idx = 0;
    let store = 0;
    for (let i = 0; i < x.length; i++) {
      const y = buf[idx];
      store = y * 0.55 + store * 0.45;
      buf[idx] = x[i] + store * 0.82;
      out[i] += y * 0.25;
      idx = (idx + 1) % size;
    }
  }
  for (const d of [556, 441]) {
    const size = Math.floor(d + spread);
    const buf = new Float32Array(size);
    let idx = 0;
    for (let i = 0; i < out.length; i++) {
      const b = buf[idx];
      const y = -out[i] + b;
      buf[idx] = out[i] + b * 0.5;
      out[i] = y;
      idx = (idx + 1) % size;
    }
  }
  return out;
}

// Shimmer: the reverb tail played back an octave up (simple two-grain pitch shift), for a futuristic halo.
function shimmer(x) {
  const out = new Float32Array(x.length);
  const W = 2048;
  for (let i = 0; i < x.length; i++) {
    let v = 0;
    for (const off of [0, W / 2]) {
      const ph = ((i + off) % W) / W;
      const src = Math.floor(i - W * (1 - ph)); // delay shrinks 1 sample per sample: read at 2x = octave up
      const g = Math.sin(Math.PI * ph);
      if (src >= 0 && src < x.length) v += x[src] * g;
    }
    out[i] = v * 0.5;
  }
  lowpass(out, 5000);
  return out;
}

// Speaker mastering: split at ~140 Hz, keep the sub underneath (felt on earbuds) and push the
// 300 Hz-4 kHz range a phone speaker can actually play, so the sound carries over the vibration.
function speakerEq(x) {
  const a = 1 - Math.exp((-TAU * 140) / RATE);
  const b = 1 - Math.exp((-TAU * 2600) / RATE);
  let lo = 0, lo2 = 0, pres = 0;
  for (let i = 0; i < x.length; i++) {
    lo += a * (x[i] - lo); lo2 += a * (lo - lo2);
    const rest = x[i] - lo2;
    pres += b * (rest - pres);
    x[i] = lo2 * 0.55 + rest * 1.5 + (rest - pres) * 0.35; // sub, body, a little presence
  }
}

function master(L, R) {
  const len = L.length;
  speakerEq(L); speakerEq(R);
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const DRIVE = 3.0; // tape-style saturation: louder on a phone speaker, still smooth
  const sat = (v) => Math.tanh((v / (peak || 1)) * DRIVE) / Math.tanh(DRIVE);
  for (let i = 0; i < len; i++) { L[i] = sat(L[i]); R[i] = sat(R[i]); }
  const fadeIn = Math.floor(0.002 * RATE);
  const fadeOut = Math.floor(0.25 * RATE);
  for (let i = 0; i < fadeIn; i++) { L[i] *= i / fadeIn; R[i] *= i / fadeIn; }
  for (let i = 0; i < fadeOut; i++) { const g = (i / fadeOut) ** 2; L[len - 1 - i] *= g; R[len - 1 - i] *= g; }
  const n = len;
  const b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(RATE, 24);
  b.writeUInt32LE(RATE * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  const s = (v) => Math.round(Math.max(-1, Math.min(1, v * 0.96)) * 32767);
  for (let i = 0; i < n; i++) { b.writeInt16LE(s(L[i]), 44 + i * 4); b.writeInt16LE(s(R[i]), 46 + i * 4); }
  return b;
}

// ─── THE FOUR SOUNDS ─────────────────────────────────────────────────────────
const e = EIGHTH;
const SOUNDS = {
  // Aurora: deep D sub, Dmaj9 rolled upward like a harp stroke, a sparkle on top, pad blooming underneath.
  sound_success: [
    ['sub', 38, 0, 1.2, 0.38],
    ['pad', 74, 0, 1.6, 0.18, -0.3], ['pad', 81, 0, 1.6, 0.14, 0.3],
    ['rhodes', 74, 0.0, 1.4, 0.42, -0.5],
    ['rhodes', 78, e * 0.33, 1.3, 0.38, -0.2],
    ['rhodes', 81, e * 0.66, 1.3, 0.38, 0.1],
    ['rhodes', 85, e * 1.0, 1.3, 0.36, 0.35],
    ['rhodes', 88, e * 1.33, 1.5, 0.36, 0.55],
    ['sparkle', 88, e * 1.9, 1.2, 0.2, 0.4], ['sparkle', 93, e * 2.4, 1.2, 0.14, -0.4],
  ],
  // Low tide: calm but unmistakable. Deep B pulse twice; Bm9 settles down onto Gmaj7.
  sound_alert: [
    ['sub', 35, 0, 0.7, 0.40], ['sub', 31, e * 2, 1.1, 0.40],
    ['rhodes', 71, 0, 0.9, 0.42, -0.4], ['rhodes', 74, 0.02, 0.9, 0.36, -0.1], ['rhodes', 78, 0.04, 0.9, 0.34, 0.2], ['rhodes', 85, 0.06, 0.9, 0.3, 0.45],
    ['rhodes', 67, e * 2, 1.3, 0.42, -0.4], ['rhodes', 71, e * 2 + 0.02, 1.3, 0.36, -0.1], ['rhodes', 74, e * 2 + 0.04, 1.3, 0.34, 0.2], ['rhodes', 78, e * 2 + 0.06, 1.3, 0.32, 0.45],
    ['pad', 59, 0, 2.0, 0.16],
  ],
  // Droplet: a water-drop blip, then a soft A/E dyad and a whisper of sub.
  sound_gentle: [
    ['droplet', 81, 0, 0.25, 0.5, 0.2],
    ['sub', 45, 0.06, 0.6, 0.19],
    ['rhodes', 81, 0.07, 1.0, 0.4, -0.25], ['rhodes', 88, 0.09, 1.0, 0.34, 0.25],
    ['sparkle', 93, 0.2, 0.7, 0.08, 0.5],
  ],
  // Lift-off: sub drop, a rising sweep, D then A answered by the echo.
  sound_entry: [
    ['sweep', 50, 0, 0.55, 0.22],
    ['sub', 38, 0.5, 0.9, 0.38],
    ['rhodes', 74, 0.5, 0.9, 0.42, -0.35], ['rhodes', 81, 0.5 + e, 1.2, 0.42, 0.35],
    ['sparkle', 81, 0.5 + e, 0.8, 0.12, 0.6],
  ],
};

for (const f of readdirSync(OUT)) if (f.startsWith('sound_') && f.endsWith('.wav')) unlinkSync(join(OUT, f));
for (const [name, notes] of Object.entries(SOUNDS)) writeFileSync(join(OUT, `${name}.wav`), render(notes, name === 'sound_gentle' ? { tail: 0.8, delay: 0.16 } : {}));
console.log('wrote', Object.keys(SOUNDS).join(', '));
