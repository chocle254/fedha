// Generates the app's notification sounds (res/raw/*.wav). Run: node android/tools/make-sounds.mjs
// Four sounds, shared by kind of news:
//   sound_success  TP hit, NestLink withdrawal done     bright glass-bell arpeggio rising
//   sound_alert    SL hit, UpesiPay balance low          warm mallet, two falling notes, twice
//   sound_gentle   planner, Jarvis, everything else      one soft glass tap
//   sound_entry    trade entered                         crisp rising fifth
// Voices are FM bells and marimba-like mallets, in stereo (slightly detuned left/right),
// in a small room reverb, then lifted with a soft saturator so they stay loud on a phone speaker.
import { writeFileSync, readdirSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const RATE = 44100;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../app/src/main/res/raw');
const TAU = Math.PI * 2;
const note = (n) => 440 * 2 ** ((n - 69) / 12); // MIDI number -> Hz

// Glassy FM bell: modulator at `ratio` × carrier, brightness fading faster than the tone.
function bell(f, t, dur, { ratio = 3.5, index = 2.2, bright = 3 } = {}) {
  const env = Math.min(1, t / 0.004) * Math.exp((-5 * t) / dur);
  const idx = index * Math.exp((-bright * t) / dur);
  return env * (Math.sin(TAU * f * t + idx * Math.sin(TAU * f * ratio * t)) + 0.18 * Math.sin(TAU * 2 * f * t) * Math.exp(-8 * t));
}

// Marimba-like mallet: wooden partials (1, 3.93, 9.2) with the high ones dying quickly.
function mallet(f, t, dur) {
  const a = Math.min(1, t / 0.003);
  return a * (Math.sin(TAU * f * t) * Math.exp((-4 * t) / dur)
    + 0.4 * Math.sin(TAU * 3.93 * f * t) * Math.exp(-28 * t)
    + 0.12 * Math.sin(TAU * 9.2 * f * t) * Math.exp(-60 * t));
}

// Soft glass tap: pure tone with a quiet fifth and a breathy attack.
function glass(f, t, dur) {
  const env = Math.min(1, t / 0.008) * Math.exp((-4 * t) / dur);
  return env * (Math.sin(TAU * f * t) + 0.25 * Math.sin(TAU * 1.5 * f * t) * Math.exp(-6 * t) + 0.1 * Math.sin(TAU * 3 * f * t) * Math.exp(-14 * t));
}

const VOICES = { bell, mallet, glass };

// notes: [voice, midi, start s, length s, volume, opts]
function render(notes, { tail = 0.9, wet = 0.14 } = {}) {
  const len = Math.ceil(RATE * (Math.max(...notes.map((n) => n[2] + n[3])) + tail));
  const L = new Float32Array(len);
  const R = new Float32Array(len);
  for (const [voice, midi, start, dur, vol, opts] of notes) {
    const fn = VOICES[voice];
    const f = note(midi);
    const s0 = Math.floor(start * RATE);
    const n = Math.floor((dur + 0.6) * RATE);
    for (let i = 0; i < n && s0 + i < len; i++) {
      const t = i / RATE;
      L[s0 + i] += vol * fn(f * 0.9985, t, dur, opts); // a hair of detune each side gives width
      R[s0 + i] += vol * fn(f * 1.0015, t, dur, opts);
    }
  }
  for (const ch of [L, R]) lowpass(ch, 9000);
  const [rl, rr] = [reverb(L, 0), reverb(R, 23)];
  for (let i = 0; i < len; i++) { L[i] = L[i] * (1 - wet) + rl[i] * wet; R[i] = R[i] * (1 - wet) + rr[i] * wet; }
  // Loudness: phone speakers are small, so after normalising, a soft saturator lifts the quiet ring of each
  // note (higher average level, same peak) so the sound carries over the vibration motor.
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const DRIVE = 3.2;
  const sat = (v) => Math.tanh((v / (peak || 1)) * DRIVE) / Math.tanh(DRIVE);
  for (let i = 0; i < len; i++) { L[i] = sat(L[i]); R[i] = sat(R[i]); }
  // Fade the last 80 ms.
  const fade = Math.floor(0.08 * RATE);
  for (let i = 0; i < fade; i++) { const g = i / fade; L[len - 1 - i] *= g; R[len - 1 - i] *= g; }
  const gain = 0.97;
  return wav(L, R, gain);
}

function lowpass(x, cutoff) {
  const a = 1 - Math.exp((-TAU * cutoff) / RATE);
  let y = 0;
  for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); x[i] = y; }
}

// Small-room reverb (Freeverb style): 4 damped combs in parallel, then 2 all-passes. `spread` decorrelates L/R.
function reverb(x, spread) {
  const out = new Float32Array(x.length);
  for (const d of [1116, 1188, 1277, 1356]) {
    const size = Math.floor(((d + spread) * RATE) / 44100);
    const buf = new Float32Array(size);
    let idx = 0;
    let store = 0;
    for (let i = 0; i < x.length; i++) {
      const y = buf[idx];
      store = y * 0.6 + store * 0.4; // damping
      buf[idx] = x[i] + store * 0.78; // room size
      out[i] += y * 0.25;
      idx = (idx + 1) % size;
    }
  }
  for (const d of [556, 441]) {
    const size = Math.floor(((d + spread) * RATE) / 44100);
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

function wav(L, R, gain) {
  const n = L.length;
  const b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(RATE, 24);
  b.writeUInt32LE(RATE * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  const s = (v) => Math.round(Math.max(-1, Math.min(1, v * gain)) * 32767);
  for (let i = 0; i < n; i++) { b.writeInt16LE(s(L[i]), 44 + i * 4); b.writeInt16LE(s(R[i]), 46 + i * 4); }
  return b;
}

const SOUNDS = {
  // E major, rising: E6 G#6 B6 then a ringing E7 with a soft E6 underneath.
  sound_success: [
    ['bell', 88, 0.0, 0.5, 0.55, { ratio: 3.5, index: 1.6 }],
    ['bell', 92, 0.075, 0.5, 0.5, { ratio: 3.5, index: 1.6 }],
    ['bell', 95, 0.15, 0.55, 0.5, { ratio: 3.5, index: 1.6 }],
    ['bell', 100, 0.24, 1.1, 0.42, { ratio: 3.5, index: 1.2 }],
    ['glass', 88, 0.24, 1.1, 0.25],
  ],
  // Warm minor fall, A5 -> F#5 (high enough for a phone speaker to play loud), said twice.
  sound_alert: [
    ['mallet', 81, 0.0, 0.45, 0.8], ['bell', 81, 0.0, 0.35, 0.3, { ratio: 2, index: 1.2 }],
    ['mallet', 78, 0.17, 0.6, 0.8], ['bell', 78, 0.17, 0.45, 0.3, { ratio: 2, index: 1.2 }],
    ['mallet', 81, 0.52, 0.45, 0.75], ['bell', 81, 0.52, 0.35, 0.28, { ratio: 2, index: 1.2 }],
    ['mallet', 78, 0.69, 0.8, 0.75], ['bell', 78, 0.69, 0.55, 0.28, { ratio: 2, index: 1.2 }],
  ],
  // One soft glass tap on A5 with a faint octave shimmer.
  sound_gentle: [
    ['glass', 81, 0.0, 0.8, 0.7],
    ['bell', 93, 0.01, 0.5, 0.3, { ratio: 2, index: 0.9 }],
  ],
  // Crisp rising fifth, D5 -> A5, like a confirmation.
  sound_entry: [
    ['bell', 74, 0.0, 0.35, 0.6, { ratio: 2, index: 1.8, bright: 5 }], ['mallet', 74, 0.0, 0.3, 0.3],
    ['bell', 81, 0.11, 0.7, 0.6, { ratio: 2, index: 1.6, bright: 5 }], ['mallet', 81, 0.11, 0.4, 0.3],
  ],
};

for (const f of readdirSync(OUT)) if (f.startsWith('sound_') && f.endsWith('.wav')) unlinkSync(join(OUT, f));
for (const [name, notes] of Object.entries(SOUNDS)) writeFileSync(join(OUT, `${name}.wav`), render(notes));
console.log('wrote', Object.keys(SOUNDS).join(', '));
