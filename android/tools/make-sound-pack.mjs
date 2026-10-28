// A pick-list of futuristic, glassy notification sounds (not used by the app until chosen).
// Run: node android/tools/make-sound-pack.mjs <output folder>
// Uses the engine in make-sounds.mjs (mixing, ping-pong echo, reverb, shimmer, lo-fi, speaker mastering)
// and adds glass voices: crystal (wine-glass partials), glass bowl (slow beating), sonar ping,
// plucked glass (Karplus-Strong), ring-mod hologram, zero-g riser and liquid bubble.
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { VOICES, render, EIGHTH_S as e } from './make-sounds.mjs';

const RATE = 44100;
const TAU = Math.PI * 2;

// Wine-glass partial ratios: bright, pure, slightly inharmonic, each dying faster than the last.
function crystal(f, t, dur) {
  const a = Math.min(1, t / 0.002);
  const P = [[1, 1, 1], [2.756, 0.45, 2.2], [5.404, 0.22, 4], [8.933, 0.1, 7]];
  let v = 0;
  for (const [r, g, k] of P) v += g * Math.sin(TAU * f * r * t) * Math.exp((-k * 3 * t) / dur);
  return a * v;
}

// Singing bowl: two close partials beat slowly, so the tone shimmers as it rings.
function bowl(f, t, dur) {
  const a = Math.min(1, t / 0.01);
  const env = Math.exp((-2.5 * t) / dur);
  return a * env * (Math.sin(TAU * f * t) + Math.sin(TAU * f * 1.004 * t) + 0.35 * Math.sin(TAU * f * 2.71 * t) * Math.exp(-3 * t)) * 0.5;
}

// Sonar ping: a pure sine with a soft attack and a long, clean ring.
function ping(f, t, dur) {
  return Math.min(1, t / 0.006) * Math.exp((-3 * t) / dur) * Math.sin(TAU * f * t);
}

// Hologram: glass tone ring-modulated by a non-harmonic carrier, a little metallic and otherworldly.
function holo(f, t, dur) {
  const env = Math.min(1, t / 0.003) * Math.exp((-4 * t) / dur);
  const g = Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * f * 2.756 * t);
  return env * (0.6 * g + 0.5 * g * Math.sin(TAU * f * 1.618 * t));
}

// Zero-G: a sine gliding up an octave and a fifth, like something lifting off.
function riser(f, t, dur) {
  const k = Math.min(1, t / dur);
  const phase = (TAU * f * dur * (2 ** (1.58 * k) - 1)) / (1.58 * Math.LN2); // integral of f * 2^(1.58 t/dur)
  const env = Math.sin(Math.PI * Math.min(1, t / dur)) ** 1.5;
  return env * (Math.sin(phase) + 0.25 * Math.sin(2 * phase));
}

// Liquid bubble: FM glide up with a quick close, like a chrome droplet.
function bubble(f, t, dur) {
  const glide = 1 + 1.2 * Math.min(1, t / 0.08);
  const env = Math.min(1, t / 0.002) * Math.exp((-7 * t) / dur);
  return env * Math.sin(TAU * f * glide * t + 1.5 * Math.sin(TAU * f * 0.5 * t) * Math.exp(-t * 20));
}

// Plucked glass string (Karplus-Strong), rendered once per pitch and cached.
const plucks = new Map();
function pluck(f, t, dur) {
  const key = `${f.toFixed(2)}:${dur}`;
  if (!plucks.has(key)) {
    const n = Math.floor((dur * 1.6 + 0.3) * RATE);
    const P = Math.max(2, Math.round(RATE / f));
    const buf = new Float32Array(n);
    let seed = 11;
    for (let i = 0; i < P; i++) buf[i] = ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    const damp = 0.996 ** (1 / dur);
    for (let i = P; i < n; i++) buf[i] = damp * 0.5 * (buf[i - P] + buf[i - P + 1]);
    // Add a glassy overtone on top of the string.
    for (let i = 0; i < n; i++) buf[i] = buf[i] * 0.8 + 0.25 * Math.sin(TAU * f * 2.756 * (i / RATE)) * Math.exp(-(i / RATE) * 9);
    plucks.set(key, buf);
  }
  const buf = plucks.get(key);
  const i = Math.floor(t * RATE);
  return i < buf.length ? buf[i] : 0;
}

Object.assign(VOICES, { crystal, bowl, ping, holo, riser, bubble, pluck });

const SHORT = { tail: 0.5, delay: 0.16, fb: 0.3, wet: 0.24 };
const roll = (voice, notes, step, dur, gain, start = 0) =>
  notes.map((m, i) => [voice, m, start + i * step, dur, gain, -0.6 + (1.2 * i) / Math.max(1, notes.length - 1)]);

// [file name, what it is, notes, options]
const PACK = [
  ['01-crystal-rise', 'Dmaj9 rolled up on crystal glass, sub underneath', [['sub', 38, 0, 0.8, 0.5], ['knock', 88, 0, 0.1, 0.25], ...roll('crystal', [74, 78, 81, 85, 88], 0.06, 0.9, 0.4)], { ...SHORT, maxLen: 1.6 }],
  ['02-glass-orbit', 'two crystal notes orbiting left and right on a long echo', [['sub', 45, 0, 0.7, 0.45], ['crystal', 81, 0, 0.8, 0.5, -0.7], ['crystal', 88, e, 0.9, 0.45, 0.7]], { tail: 0.7, delay: 0.3, fb: 0.45, maxLen: 1.9 }],
  ['03-neon-drop', 'chrome droplet into a glass major 7th', [['bubble', 79, 0, 0.3, 0.45, 0.3], ['sub', 43, 0.08, 0.7, 0.45], ...roll('crystal', [67, 71, 74, 78], 0.025, 0.9, 0.36, 0.08)], { ...SHORT, maxLen: 1.5 }],
  ['04-quartz', 'one big crystal strike with a shimmering halo', [['knock', 93, 0, 0.1, 0.3], ['sub', 38, 0, 0.9, 0.5], ['crystal', 86, 0, 1.3, 0.6], ['crystal', 74, 0, 1.3, 0.3]], { tail: 0.7, wet: 0.3, maxLen: 1.8 }],
  ['05-halo', 'reverse glass swell landing on a chord', [['~crystal', 81, 0, 0.45, 0.45, -0.3], ['~crystal', 88, 0, 0.45, 0.35, 0.3], ['sub', 45, 0.45, 0.7, 0.5], ['knock', 88, 0.45, 0.1, 0.25], ...roll('crystal', [69, 76, 81], 0.02, 0.8, 0.4, 0.45)], { ...SHORT, maxLen: 1.8 }],
  ['06-hologram', 'ring-modulated glass dyad, metallic and otherworldly', [['sub', 40, 0, 0.7, 0.45], ['holo', 76, 0, 0.9, 0.6, -0.4], ['holo', 83, 0.09, 0.9, 0.55, 0.4]], { ...SHORT, maxLen: 1.5 }],
  ['07-aurora-glass', 'Aurora played on glass instead of piano', [['knock', 86, 0, 0.1, 0.3], ['sub', 38, 0, 0.75, 0.55], ['pad', 74, 0, 0.9, 0.14], ...roll('crystal', [74, 78, 81, 85, 88], 0.055, 0.85, 0.38), ['sparkle', 93, 0.3, 0.7, 0.18, 0.45]], { ...SHORT, maxLen: 1.65 }],
  ['08-prism', 'fast falling glass cascade, pentatonic', [['sub', 38, 0.3, 0.7, 0.45], ...roll('crystal', [93, 90, 88, 85, 81, 78], 0.05, 0.6, 0.34)], { ...SHORT, maxLen: 1.5 }],
  ['09-ice-pulse', 'two deep pulses with glass ticks (alert style)', [['sub', 35, 0, 0.45, 0.55], ['sub', 31, 0.34, 0.7, 0.55], ['crystal', 83, 0, 0.4, 0.4], ['crystal', 79, 0.34, 0.7, 0.4]], { ...SHORT, maxLen: 1.4 }],
  ['10-zero-g', 'sine lifting off into a glass shimmer', [['riser', 62, 0, 0.4, 0.35], ['sub', 38, 0.38, 0.7, 0.5], ['crystal', 86, 0.38, 0.9, 0.45], ['sparkle', 93, 0.45, 0.6, 0.15]], { ...SHORT, maxLen: 1.7 }],
  ['11-lumen', 'three quick bright glass notes, C E G', [['sub', 36, 0, 0.6, 0.45], ...roll('crystal', [84, 88, 91], 0.07, 0.6, 0.42)], { ...SHORT, maxLen: 1.2 }],
  ['12-nebula', 'pad bloom with crystal sparkles drifting through', [['pad', 69, 0, 1.2, 0.22, -0.3], ['pad', 76, 0, 1.2, 0.18, 0.3], ['sub', 33, 0, 1.0, 0.4], ['crystal', 93, 0.25, 0.6, 0.25, 0.6], ['crystal', 88, 0.45, 0.6, 0.22, -0.6], ['crystal', 95, 0.65, 0.6, 0.18, 0.3]], { tail: 0.5, wet: 0.3, maxLen: 1.9 }],
  ['13-satellite', 'sonar ping with a long clean echo', [['sub', 38, 0, 0.6, 0.45], ['ping', 86, 0, 0.9, 0.55], ['ping', 98, 0, 0.5, 0.12]], { tail: 0.8, delay: 0.32, fb: 0.5, maxLen: 2.0 }],
  ['14-liquid-chrome', 'two chrome bubbles and a bell', [['bubble', 76, 0, 0.25, 0.4, -0.4], ['bubble', 83, 0.1, 0.25, 0.4, 0.4], ['sub', 40, 0.12, 0.6, 0.45], ['crystal', 88, 0.18, 0.8, 0.35]], { ...SHORT, maxLen: 1.4 }],
  ['15-starlight', 'high sparkle cluster over a deep sub', [['sub', 33, 0, 0.9, 0.4], ['knock', 90, 0, 0.1, 0.2], ...[84, 81, 88, 79, 86].map((m, i) => ['sparkle', m, i * 0.045, 0.6, 0.3, i % 2 ? 0.6 : -0.6])], { tail: 0.6, wet: 0.3, maxLen: 1.5 }],
  ['16-cyber-koto', 'plucked glass strings, a rising fifth', [['sub', 38, 0, 0.6, 0.3], ['pluck', 74, 0, 0.8, 1.1, -0.4], ['pluck', 81, 0.12, 0.9, 1.1, 0.4], ['crystal', 86, 0.12, 0.6, 0.15, 0.4]], { ...SHORT, maxLen: 1.5 }],
  ['17-mirage', 'detuned glass chord that wavers like heat haze', [['sub', 40, 0, 0.8, 0.45], ['bowl', 76, 0, 1.1, 0.45, -0.4], ['bowl', 80, 0.02, 1.1, 0.4, 0.4], ['bowl', 83, 0.04, 1.1, 0.35, 0]], { tail: 0.5, wet: 0.28, maxLen: 1.7 }],
  ['18-pulse-glass', 'two pumping glass chord hits with sub', [['sub', 38, 0, 0.35, 0.55], ['sub', 38, 0.28, 0.6, 0.55], ['knock', 86, 0, 0.1, 0.25], ['knock', 86, 0.28, 0.1, 0.25], ...roll('crystal', [74, 78, 81], 0.0, 0.3, 0.32), ...roll('crystal', [76, 79, 83], 0.0, 0.7, 0.32, 0.28)], { ...SHORT, maxLen: 1.4 }],
  ['19-afterglow', 'soft glass dyad with tape wobble, very gentle', [['sub', 45, 0, 0.6, 0.3], ['crystal', 81, 0, 0.9, 0.38, -0.3], ['crystal', 85, 0.03, 0.9, 0.32, 0.3]], { tail: 0.5, wet: 0.3, crackle: 0.006, maxLen: 1.5 }],
  ['20-arrival', 'whoosh, sub drop and a glass hit (Lift-off on glass)', [['sweep', 50, 0, 0.45, 0.22], ['sub', 38, 0.42, 0.8, 0.5], ['knock', 88, 0.42, 0.1, 0.3], ['crystal', 74, 0.42, 0.8, 0.4, -0.35], ['crystal', 81, 0.42 + e, 0.9, 0.4, 0.35]], { ...SHORT, maxLen: 1.9 }],
  ['21-vapor', 'reverse crystal breath, no hit, very smooth', [['~crystal', 86, 0, 0.5, 0.45, -0.3], ['~crystal', 81, 0, 0.5, 0.4, 0.3], ['~sub', 38, 0, 0.5, 0.35], ['ping', 93, 0.5, 0.5, 0.15]], { tail: 0.6, wet: 0.3, maxLen: 1.4 }],
  ['22-signal', 'three-note minor glass motif (alert style)', [['sub', 35, 0, 0.9, 0.5], ...roll('crystal', [83, 79, 76], 0.13, 0.55, 0.42)], { ...SHORT, maxLen: 1.4 }],
  ['23-moonstone', 'low glass bowl with deep beating and sub', [['sub', 31, 0, 1.0, 0.5], ['bowl', 62, 0, 1.3, 0.55], ['bowl', 74, 0.05, 1.1, 0.3]], { tail: 0.5, wet: 0.3, maxLen: 1.8 }],
  ['24-photon', 'tiny tick-chime, under a second', [['knock', 95, 0, 0.08, 0.3], ['sub', 45, 0, 0.35, 0.35], ['crystal', 93, 0, 0.45, 0.45]], { tail: 0.3, delay: 0.12, fb: 0.2, maxLen: 0.8 }],
];

const out = process.argv[2];
if (!out) { console.error('usage: node make-sound-pack.mjs <output folder>'); process.exit(1); }
mkdirSync(out, { recursive: true });
const list = [];
for (const [name, what, notes, opts] of PACK) {
  writeFileSync(join(out, `${name}.wav`), render(notes, opts));
  list.push(`${name}.wav  ${what}`);
}
writeFileSync(join(out, 'LIST.txt'), list.join('\n') + '\n');
console.log(`wrote ${PACK.length} sounds to ${out}`);
