// Pick-list 2: 80 futuristic notification sounds across genres, mastered for HEADPHONES (full sub-bass,
// no phone-speaker EQ). 30 success, 25 failed ("AI error"), 25 chat.
// Run: node android/tools/make-sound-pack-2.mjs <output folder>
//
// New instruments: supersaw, reese bass, wobble bass, 808 with glide, kick, amapiano log drum, clap/snare,
// hats, cowbell (phonk), formant voice chops ("ahh", "ooh"), data chirps, plucks, glass.
// "AI error" effects: tape-stop, glitch stutter, bit-crush, power-down.
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { VOICES, render } from './make-sounds.mjs';

const RATE = 44100;
const TAU = Math.PI * 2;
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const noise = (t, seed = 0) => { const x = Math.sin((Math.floor(t * RATE) + seed * 7919) * 12.9898) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };
const env = (t, dur, a = 0.003, k = 3) => Math.min(1, t / a) * Math.exp((-k * t) / dur);

// ─── INSTRUMENTS (f Hz, t s, dur s) ──────────────────────────────────────────
function saw(f, t, dur, bright = 1) {
  let v = 0;
  const N = Math.min(24, Math.floor(16000 / f));
  for (let n = 1; n <= N; n++) v += (Math.sin(TAU * f * n * t) / n) * Math.exp(-n * (0.12 / bright) * (1 + 6 * t / dur));
  return v * 0.6;
}
const supersaw = (f, t, dur) => env(t, dur, 0.01, 2.5) * [-0.011, -0.005, 0, 0.006, 0.012].reduce((a, d) => a + saw(f * (1 + d), t + d, dur, 1.4), 0) / 3;
const reese = (f, t, dur) => env(t, dur, 0.02, 2) * (saw(f * 0.995, t, dur, 0.5) + saw(f * 1.005, t, dur, 0.5)) * 0.8;
// Wobble: saw bass whose brightness opens and closes (LFO), the dubstep "wub".
function wobble(rate) {
  return (f, t, dur) => {
    const cut = 120 + 2200 * (0.5 - 0.5 * Math.cos(TAU * rate * t));
    let v = 0;
    for (let n = 1; n <= 30; n++) { const fn = f * n; v += (Math.sin(TAU * fn * t) / n) / (1 + (fn / cut) ** 4); }
    return env(t, dur, 0.01, 1.8) * v;
  };
}
// 808 that slides from `from` semitones away down (or up) to its pitch (trap glide). Phase is accumulated
// step by step (render calls each note's samples in order, starting at t = 0).
function glide808(from) {
  let ph = 0;
  let last = 0;
  return (f, t, dur) => {
    if (t === 0) { ph = 0; last = 0; }
    ph += TAU * f * 2 ** ((from * Math.exp(-t / 0.09)) / 12) * (t - last);
    last = t;
    const x = Math.sin(ph) * env(t, dur, 0.002, 2.2);
    return 0.8 * x + 0.35 * Math.tanh(3 * x);
  };
}
const kick = (f, t, dur) => { const ph = TAU * (45 * t + (105 * 0.03) * (1 - Math.exp(-t / 0.03))); return Math.sin(ph) * env(t, Math.max(dur, 0.3), 0.001, 4) * 1.2; };
// Amapiano log drum: a hollow, pitched knock with a fast pitch drop and a woody overtone.
const logdrum = (f, t, dur) => { const ph = TAU * f * (t + 0.012 * 1.4 * (1 - Math.exp(-t / 0.012))); const x = Math.sin(ph) + 0.3 * Math.sin(2.02 * ph) * Math.exp(-t * 25); return Math.tanh(1.8 * x) * env(t, dur, 0.001, 4); };
const clap = (f, t) => { const b = [0, 0.011, 0.022].reduce((a, o) => a + (t >= o ? noise(t, 3) * Math.exp(-(t - o) / 0.006) : 0), 0); return b * 0.5 + noise(t, 5) * Math.exp(-t / 0.09) * 0.5 + Math.sin(TAU * 190 * t) * Math.exp(-t / 0.03) * 0.4; };
const hat = (f, t) => noise(t, 9) * Math.exp(-t / 0.018) * 0.5 * (0.5 + 0.5 * Math.sin(TAU * 7000 * t));
const shaker = (f, t, dur) => noise(t, 13) * Math.sin(Math.PI * Math.min(1, t / Math.max(0.01, dur))) * 0.35;
const cowbell = (f, t, dur) => env(t, dur, 0.001, 5) * (Math.sign(Math.sin(TAU * 587 * t)) * 0.5 + Math.sign(Math.sin(TAU * 845 * t)) * 0.5) * 0.5;
// Formant voice: a buzzy source shaped by vowel formants, for futuristic "ahh"/"ooh" chops.
function vox(F) {
  return (f, t, dur) => {
    let v = 0;
    for (let n = 1; n <= 40; n++) {
      const fn = f * n;
      if (fn > 9000) break;
      const g = F.reduce((a, [fc, bw, amp]) => a + amp / (1 + ((fn - fc) / bw) ** 2), 0);
      v += g * Math.sin(TAU * fn * t + n);
    }
    return env(t, dur, 0.02, 2.5) * v * 0.35;
  };
}
const AH = [[730, 90, 1], [1090, 110, 0.5], [2440, 160, 0.25]];
const OO = [[300, 60, 1], [870, 90, 0.35], [2240, 150, 0.12]];
const EE = [[270, 60, 0.8], [2290, 140, 0.6], [3010, 180, 0.3]];
// Data chirp: a quick FM blip that sweeps, like a machine talking.
const chirp = (f, t, dur) => env(t, dur, 0.001, 5) * Math.sin(TAU * f * (1 + 2 * t / dur) * t + 3 * Math.sin(TAU * f * 0.51 * t));
const pluck2 = (f, t, dur) => env(t, dur, 0.001, 5) * saw(f, t, dur * 0.25, 1.2);
const glass = (f, t, dur) => env(t, dur, 0.002, 1) * [[1, 1, 3], [2.756, 0.45, 6.6], [5.404, 0.22, 12], [8.933, 0.1, 21]].reduce((a, [r, g, k]) => a + g * Math.sin(TAU * f * r * t) * Math.exp((-k * t) / dur), 0);
const subdeep = (f, t, dur) => { const x = Math.sin(TAU * f * t) * env(t, dur, 0.004, 2); return x + 0.2 * Math.tanh(2.5 * x); };
// Power-down: pitch falls linearly to zero, like a machine switching off.
const powerdown = (f, t, dur) => { const k = Math.min(1, t / dur); return Math.sin(TAU * f * (t - (t * t) / (2 * dur))) * (1 - k) * 0.9; };
const organ = (f, t, dur) => env(t, dur, 0.01, 1.5) * [1, 0.5, 0.33, 0.25, 0.12].reduce((a, g, i) => a + g * Math.sin(TAU * f * (i + 1) * t), 0) * 0.6;

Object.assign(VOICES, {
  saw: (f, t, d) => env(t, d, 0.005, 3) * saw(f, t, d), supersaw, reese, wob2: wobble(2), wob4: wobble(4), wob8: wobble(8),
  s808: glide808(0), g808: glide808(7), g808d: glide808(-12), kick, logdrum, clap, hat, shaker, cowbell,
  voxah: vox(AH), voxoo: vox(OO), voxee: vox(EE), chirp, pluck2, glass, subdeep, powerdown, organ,
});

// ─── "AI ERROR" EFFECTS (run on the dry mix) ─────────────────────────────────
export function tapeStop(start, len) {
  return (L, R) => {
    for (const x of [L, R]) {
      const src = Float32Array.from(x);
      const s0 = Math.floor(start * RATE);
      const n = Math.floor(len * RATE);
      let pos = s0;
      for (let i = s0; i < x.length; i++) {
        const k = Math.min(1, (i - s0) / n);
        pos += Math.max(0, 1 - k) ** 1.5;
        const j = Math.floor(pos);
        x[i] = k >= 1 ? 0 : (src[j] || 0) * (1 - k * 0.3);
      }
    }
  };
}
export function stutter(start, slice, repeats) {
  return (L, R) => {
    const s0 = Math.floor(start * RATE);
    const n = Math.floor(slice * RATE);
    for (const x of [L, R]) {
      const chunk = x.slice(s0, s0 + n);
      for (let r = 1; r <= repeats; r++) for (let i = 0; i < n && s0 + r * n + i < x.length; i++) x[s0 + r * n + i] = chunk[i] * (1 - r / (repeats + 2)) * (i < 40 ? i / 40 : 1);
    }
  };
}
export function crush(start, bits = 5, hold = 6) {
  return (L, R) => {
    const s0 = Math.floor(start * RATE);
    const q = 2 ** bits;
    for (const x of [L, R]) {
      let held = 0;
      for (let i = s0; i < x.length; i++) { if ((i - s0) % hold === 0) held = Math.round(x[i] * q) / q; x[i] = held; }
    }
  };
}
export const chain = (...fns) => (L, R) => fns.forEach((f) => f(L, R));

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const CH = { maj9: [0, 4, 7, 11, 14], maj7: [0, 4, 7, 11], add9: [0, 4, 7, 14], m9: [0, 3, 7, 10, 14], m7: [0, 3, 7, 10], sus2: [0, 2, 7], dim: [0, 3, 6, 9], m: [0, 3, 7], maj: [0, 4, 7], six9: [0, 4, 9, 14] };
const chord = (root, type, voice, start, dur, gain, spread = 0.012) => CH[type].map((iv, i) => [voice, root + iv, start + i * spread, dur, gain, -0.6 + (1.2 * i) / Math.max(1, CH[type].length - 1)]);
const arp = (root, type, voice, start, step, dur, gain, dir = 1) => {
  const ivs = dir > 0 ? CH[type] : [...CH[type]].reverse();
  return ivs.map((iv, i) => [voice, root + iv, start + i * step, dur, gain, i % 2 ? 0.55 : -0.55]);
};
const H = { eq: false, crackle: 0.002 }; // headphone master: no speaker EQ, full sub
const ROOTS = [38, 36, 41, 43, 33, 40, 35, 37];

// ─── GENRE RECIPES: (v = variant number) -> [notes, options] ─────────────────
export const S = {}; // success
export const F = {}; // failed
export const C = {}; // chat

S.synthwave = (v) => { const r = ROOTS[v % ROOTS.length] + 24; return [[['kick', 0, 0, 0.4, 0.9], ['subdeep', r - 24, 0, 1.2, 0.7], ...chord(r, v % 2 ? 'maj9' : 'add9', 'supersaw', 0, 1.0, 0.22), ...arp(r + 12, 'maj7', 'glass', 0.12, 0.07, 0.6, 0.25)], { ...H, maxLen: 1.7, wet: 0.28 }]; };
S.trap = (v) => { const r = ROOTS[(v + 1) % ROOTS.length]; return [[['g808', r, 0, 1.1, 0.95], ['hat', 0, 0, 0.05, 0.5], ['hat', 0, 0.06, 0.05, 0.4], ['hat', 0, 0.09, 0.05, 0.4], ['hat', 0, 0.12, 0.05, 0.45], ...arp(r + 36, v % 2 ? 'm9' : 'six9', 'glass', 0.05, 0.08, 0.5, 0.32)], { ...H, maxLen: 1.6, delay: 0.25 }]; };
S.amapiano = (v) => { const r = ROOTS[(v + 2) % ROOTS.length] + 12; return [[['logdrum', r, 0, 0.35, 0.9], ['logdrum', r + 7, 0.21, 0.3, 0.75], ['logdrum', r + 12, 0.32, 0.4, 0.8], ['shaker', 0, 0, 0.4, 0.5], ...chord(r + 24, v % 2 ? 'maj9' : 'm9', 'rhodes', 0.0, 1.0, 0.28, 0.02)], { ...H, maxLen: 1.6, delay: 0.18 }]; };
S.futuregarage = (v) => { const r = ROOTS[(v + 3) % ROOTS.length] + 12; return [[['reese', r - 12, 0, 1.2, 0.5], ['voxah', r + 24, 0.0, 0.4, 0.45], ['voxah', r + 31, 0.18, 0.5, 0.4], ['clap', 0, 0.36, 0.2, 0.45], ...chord(r + 24, 'maj7', 'pad', 0, 1.2, 0.18)], { ...H, maxLen: 1.7, wet: 0.32, delay: 0.3 }]; };
S.dubstep = (v) => { const r = ROOTS[(v + 4) % ROOTS.length]; return [[['kick', 0, 0, 0.3, 1], ['wob4', r, 0, 0.6, 0.7], ['wob8', r, 0.5, 0.5, 0.6], ...chord(r + 36, 'maj', 'supersaw', 0.55, 0.8, 0.22), ['clap', 0, 0.55, 0.2, 0.5]], { ...H, maxLen: 1.6 }]; };
S.dnb = (v) => { const r = ROOTS[(v + 5) % ROOTS.length]; return [[['kick', 0, 0, 0.2, 0.9], ['hat', 0, 0.09, 0.05, 0.5], ['clap', 0, 0.19, 0.2, 0.5], ['hat', 0, 0.28, 0.05, 0.4], ['kick', 0, 0.34, 0.2, 0.8], ['reese', r, 0, 1.1, 0.55], ...chord(r + 36, 'add9', 'glass', 0.19, 0.9, 0.22)], { ...H, maxLen: 1.5 }]; };
S.lofi = (v) => { const r = ROOTS[(v + 6) % ROOTS.length] + 24; return [[['subdeep', r - 24, 0, 1.2, 0.8], ...chord(r, v % 2 ? 'maj9' : 'six9', 'rhodes', 0, 1.1, 0.32, 0.03), ['sparkle', r + 26, 0.3, 0.6, 0.12]], { ...H, crackle: 0.008, maxLen: 1.7, wet: 0.3 }]; };
S.trance = (v) => { const r = ROOTS[(v + 7) % ROOTS.length] + 24; return [[['kick', 0, 0, 0.3, 0.9], ['subdeep', r - 24, 0, 1, 0.6], ...arp(r, 'maj9', 'pluck2', 0, 0.06, 0.4, 0.4), ...chord(r + 12, 'maj', 'supersaw', 0.3, 0.9, 0.18)], { ...H, maxLen: 1.6, delay: 0.3, fb: 0.45 }]; };
S.kpop = (v) => { const r = ROOTS[v % ROOTS.length] + 36; return [[['clap', 0, 0.0, 0.2, 0.55], ['s808', r - 36, 0, 0.9, 0.8], ...arp(r, 'add9', 'glass', 0, 0.05, 0.6, 0.38), ['sparkle', r + 19, 0.22, 0.5, 0.2]], { ...H, maxLen: 1.3 }]; };
S.ambient = (v) => { const r = ROOTS[(v + 1) % ROOTS.length] + 24; return [[['subdeep', r - 24, 0, 1.5, 0.8], ['~glass', r + 12, 0, 0.4, 0.3], ...chord(r + 12, 'maj9', 'glass', 0.4, 1.1, 0.3, 0.02), ...chord(r, 'maj7', 'pad', 0, 1.6, 0.16)], { ...H, maxLen: 1.9, wet: 0.36 }]; };
S.vaporwave = (v) => { const r = ROOTS[(v + 2) % ROOTS.length] + 24; return [[['subdeep', r - 24, 0, 1.3, 0.7], ...chord(r - 1, 'maj7', 'rhodes', 0, 1.2, 0.3, 0.05).map((n) => [...n.slice(0, 5), n[5]]), ['voxoo', r + 12, 0.1, 0.9, 0.25]], { ...H, crackle: 0.01, maxLen: 1.8, wet: 0.34 }]; };
S.cyberpunk = (v) => { const r = ROOTS[(v + 3) % ROOTS.length]; return [[['saw', r, 0, 0.8, 0.45], ['kick', 0, 0, 0.3, 0.9], ['chirp', r + 48, 0.05, 0.12, 0.25], ['chirp', r + 55, 0.15, 0.12, 0.25], ...chord(r + 36, 'sus2', 'glass', 0.25, 0.9, 0.3)], { ...H, maxLen: 1.5 }]; };
S.afrohouse = (v) => { const r = ROOTS[(v + 4) % ROOTS.length] + 12; return [[['kick', 0, 0, 0.3, 0.8], ['logdrum', r, 0.0, 0.3, 0.8], ['logdrum', r + 5, 0.14, 0.3, 0.7], ['logdrum', r + 7, 0.28, 0.4, 0.8], ['shaker', 0, 0.07, 0.2, 0.5], ...arp(r + 36, 'six9', 'glass', 0.28, 0.05, 0.6, 0.3)], { ...H, maxLen: 1.5 }]; };
S.techno = (v) => { const r = ROOTS[(v + 5) % ROOTS.length]; return [[['kick', 0, 0, 0.4, 1], ['subdeep', r, 0.02, 0.9, 0.6], ...chord(r + 36, v % 2 ? 'm7' : 'sus2', 'saw', 0.0, 0.25, 0.25, 0), ...chord(r + 36, v % 2 ? 'm7' : 'sus2', 'saw', 0.32, 0.25, 0.2, 0)], { ...H, maxLen: 1.4, delay: 0.32, fb: 0.5 }]; };
S.phonk = (v) => { const r = ROOTS[(v + 6) % ROOTS.length]; return [[['g808', r, 0, 1.0, 0.95], ['cowbell', 0, 0, 0.2, 0.4], ['cowbell', 0, 0.12, 0.2, 0.35], ['cowbell', 0, 0.24, 0.3, 0.4], ...arp(r + 36, 'm', 'glass', 0.3, 0.08, 0.5, 0.25)], { ...H, maxLen: 1.5 }]; };

F.tapestop = (v) => { const r = ROOTS[v % ROOTS.length] + 24; return [[['subdeep', r - 24, 0, 1.2, 0.8], ...chord(r, 'maj9', 'supersaw', 0, 1.2, 0.22)], { ...H, maxLen: 1.4, fx: tapeStop(0.25, 0.9) }]; };
F.glitch = (v) => { const r = ROOTS[(v + 1) % ROOTS.length] + 24; return [[['kick', 0, 0, 0.3, 0.8], ['subdeep', r - 24, 0, 1, 0.7], ...chord(r, 'm9', 'rhodes', 0, 1, 0.3)], { ...H, maxLen: 1.3, fx: chain(stutter(0.12, 0.045, 6), crush(0.5, 4, 8)) }]; };
F.crushfall = (v) => { const r = ROOTS[(v + 2) % ROOTS.length] + 36; return [[['g808d', r - 24, 0, 1.0, 0.9], ...arp(r, 'dim', 'glass', 0, 0.1, 0.5, 0.35, -1)], { ...H, maxLen: 1.4, fx: crush(0.2, 4, 10) }]; };
F.slide808 = (v) => { const r = ROOTS[(v + 3) % ROOTS.length]; return [[['g808d', r + 12, 0, 1.2, 1], ['clap', 0, 0, 0.2, 0.4], ...chord(r + 36, 'm', 'glass', 0, 0.8, 0.25)], { ...H, maxLen: 1.4 }]; };
F.reesegrowl = (v) => { const r = ROOTS[(v + 4) % ROOTS.length]; return [[['reese', r, 0, 1.2, 0.8], ['kick', 0, 0, 0.3, 0.9], ['chirp', r + 48, 0.2, 0.1, 0.2], ...chord(r + 24, 'dim', 'saw', 0.05, 0.8, 0.15)], { ...H, maxLen: 1.4, fx: crush(0.6, 6, 4) }]; };
F.systemdown = (v) => { const r = ROOTS[(v + 5) % ROOTS.length] + 36; return [[['powerdown', r, 0, 0.9, 0.5], ['subdeep', r - 36, 0, 1, 0.8], ['chirp', r + 12, 0, 0.1, 0.25]], { ...H, maxLen: 1.2 }]; };
F.wobblefail = (v) => { const r = ROOTS[(v + 6) % ROOTS.length]; return [[['kick', 0, 0, 0.3, 1], ['wob2', r + 5, 0, 0.5, 0.7], ['wob2', r, 0.45, 0.7, 0.7]], { ...H, maxLen: 1.3, fx: tapeStop(0.7, 0.5) }]; };
F.minorpulse = (v) => { const r = ROOTS[(v + 7) % ROOTS.length] + 24; return [[['subdeep', r - 24, 0, 0.45, 0.9], ['subdeep', r - 26, 0.35, 0.8, 0.9], ...chord(r, 'm9', 'glass', 0, 0.45, 0.28), ...chord(r - 2, 'm7', 'glass', 0.35, 0.8, 0.28)], { ...H, maxLen: 1.3 }]; };
F.errorchirps = (v) => { const r = ROOTS[v % ROOTS.length] + 48; return [[['subdeep', r - 48, 0, 0.9, 0.8], ['chirp', r, 0, 0.08, 0.3], ['chirp', r - 5, 0.08, 0.08, 0.3], ['chirp', r - 10, 0.16, 0.08, 0.3], ['chirp', r - 17, 0.24, 0.2, 0.3]], { ...H, maxLen: 1.0, fx: crush(0.24, 5, 6) }]; };
F.voxfail = (v) => { const r = ROOTS[(v + 1) % ROOTS.length] + 24; return [[['subdeep', r - 24, 0, 1, 0.8], ['voxoo', r + 7, 0, 0.35, 0.45], ['voxoo', r, 0.3, 0.6, 0.45]], { ...H, maxLen: 1.2, fx: tapeStop(0.45, 0.6) }]; };
F.reversefail = (v) => { const r = ROOTS[(v + 2) % ROOTS.length] + 24; return [[['~glass', r + 12, 0, 0.45, 0.35], ['~glass', r + 15, 0, 0.45, 0.3], ['g808d', r - 12, 0.45, 0.8, 0.9], ...chord(r, 'dim', 'rhodes', 0.45, 0.7, 0.25)], { ...H, maxLen: 1.5 }]; };
F.sonarlost = (v) => { const r = ROOTS[(v + 3) % ROOTS.length] + 48; return [[['subdeep', r - 48, 0, 0.9, 0.7], ['glass', r, 0, 0.5, 0.4], ['glass', r - 3, 0.3, 0.6, 0.35]], { ...H, maxLen: 1.4, delay: 0.3, fb: 0.4, fx: crush(0.35, 6, 5) }]; };
F.organfail = (v) => { const r = ROOTS[(v + 4) % ROOTS.length] + 24; return [[['subdeep', r - 24, 0, 1, 0.8], ...chord(r, 'm', 'organ', 0, 1, 0.3, 0)], { ...H, maxLen: 1.3, fx: tapeStop(0.3, 0.8) }]; };

C.vox = (v) => { const r = ROOTS[v % ROOTS.length] + 36; const V = ['voxah', 'voxoo', 'voxee'][v % 3]; return [[[V, r, 0, 0.3, 0.5], [V, r + 7, 0.12, 0.35, 0.45], ['subdeep', r - 36, 0, 0.4, 0.5]], { ...H, maxLen: 0.8, delay: 0.14, fb: 0.25 }]; };
C.bubble = (v) => { const r = ROOTS[(v + 1) % ROOTS.length] + 48; return [[['droplet', r, 0, 0.2, 0.5], ['droplet', r + 5, 0.09, 0.2, 0.45], ['subdeep', r - 48, 0.02, 0.35, 0.5]], { ...H, maxLen: 0.7, delay: 0.12, fb: 0.2 }]; };
C.data = (v) => { const r = ROOTS[(v + 2) % ROOTS.length] + 48; return [[['chirp', r, 0, 0.06, 0.3], ['chirp', r + 7, 0.06, 0.06, 0.3], ['chirp', r + 12, 0.12, 0.08, 0.3], ['subdeep', r - 48, 0, 0.35, 0.5]], { ...H, maxLen: 0.6, delay: 0.1, fb: 0.2 }]; };
C.glassblip = (v) => { const r = ROOTS[(v + 3) % ROOTS.length] + 48; return [[['glass', r, 0, 0.4, 0.45], ['glass', r + (v % 2 ? 4 : 7), 0.07, 0.45, 0.4], ['subdeep', r - 48, 0, 0.4, 0.5]], { ...H, maxLen: 0.8 }]; };
C.logtap = (v) => { const r = ROOTS[(v + 4) % ROOTS.length] + 12; return [[['logdrum', r, 0, 0.25, 0.8], ['logdrum', r + 12, 0.1, 0.25, 0.6], ['shaker', 0, 0, 0.15, 0.3]], { ...H, maxLen: 0.6, delay: 0.12, fb: 0.25 }]; };
C.bloop = (v) => { const r = ROOTS[(v + 5) % ROOTS.length] + 36; return [[['pluck2', r, 0, 0.25, 0.5], ['pluck2', r + 12, 0.08, 0.3, 0.45], ['s808', r - 36, 0, 0.4, 0.6]], { ...H, maxLen: 0.7, delay: 0.12, fb: 0.25 }]; };
C.rhodestap = (v) => { const r = ROOTS[(v + 6) % ROOTS.length] + 36; return [[['rhodes', r, 0, 0.5, 0.45], ['rhodes', r + 4, 0.02, 0.5, 0.35], ['rhodes', r + 11, 0.04, 0.5, 0.3], ['subdeep', r - 36, 0, 0.4, 0.5]], { ...H, maxLen: 0.8, crackle: 0.006 }]; };
C.holo = (v) => { const r = ROOTS[(v + 7) % ROOTS.length] + 48; return [[['sparkle', r, 0, 0.3, 0.35], ['chirp', r + 12, 0.05, 0.08, 0.2], ['subdeep', r - 48, 0, 0.35, 0.5]], { ...H, maxLen: 0.6 }]; };

// How many variants of each recipe: 30 success, 25 failed, 25 chat.
const PLAN = [
  ['S', S, { synthwave: 2, trap: 2, amapiano: 3, futuregarage: 2, dubstep: 2, dnb: 2, lofi: 2, trance: 2, kpop: 2, ambient: 2, vaporwave: 2, cyberpunk: 2, afrohouse: 2, techno: 2, phonk: 1 }, 'success'],
  ['F', F, { tapestop: 3, glitch: 3, crushfall: 2, slide808: 2, reesegrowl: 2, systemdown: 2, wobblefail: 2, minorpulse: 2, errorchirps: 2, voxfail: 2, reversefail: 1, sonarlost: 1, organfail: 1 }, 'failed'],
  ['C', C, { vox: 4, bubble: 3, data: 3, glassblip: 4, logtap: 3, bloop: 3, rhodestap: 3, holo: 2 }, 'chat'],
];

// Only write the pack when run directly (ringtones.mjs imports the instruments above).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = process.argv[2];
  if (!out) { console.error('usage: node make-sound-pack-2.mjs <output folder>'); process.exit(1); }
  const list = [];
  let total = 0;
  for (const [tag, recipes, counts, folder] of PLAN) {
    mkdirSync(join(out, folder), { recursive: true });
    let k = 1;
    for (const [genre, n] of Object.entries(counts)) {
      for (let v = 0; v < n; v++) {
        const [notes, opts] = recipes[genre](v);
        const name = `${tag}${String(k).padStart(2, '0')}-${genre}${n > 1 ? `-${v + 1}` : ''}`;
        writeFileSync(join(out, folder, `${name}.wav`), render(notes, opts));
        list.push(`${folder}/${name}.wav`);
        k++; total++;
      }
    }
  }
  writeFileSync(join(out, 'LIST.txt'), list.join('\n') + '\n');
  console.log(`wrote ${total} sounds to ${out}`);
}
