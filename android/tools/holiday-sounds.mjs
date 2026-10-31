// Holiday notification sounds (res/raw/sound_h_*.wav, also copied to the site's public/sounds for in-app banners).
// Run: node android/tools/holiday-sounds.mjs
//   sound_h_halloween  "Crypt"        a gothic pipe-organ chord (diminished), a glassy dissonant bell, distant thunder
//   sound_h_christmas  "Sleigh"       sleigh bells shaking under the first notes of Jingle Bells on a glass bell
//   sound_h_birthday   "Candles"      Happy Birthday's opening on crystal with a sparkle on top
//   sound_h_newyear    "Midnight"     a firework whistle rising, a pop, crackle, and a bright glass chord
// Uses the engine in make-sounds.mjs (echo, reverb, shimmer, speaker mastering) and the glass voices from
// make-sound-pack.mjs, plus four voices made for these: organ, thunder, jingle and pop.
import { writeFileSync, copyFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { VOICES, render } from './make-sounds.mjs';
import './make-sound-pack.mjs'; // registers crystal, bowl, riser, sparkle-friendly glass voices

const TAU = Math.PI * 2;
let seed = 12345;
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

// Pipe organ: odd and even harmonics with a slow tremolo, soft attack, held.
function organ(f, t, dur) {
  const env = Math.min(1, t / 0.08) * (t < dur ? 1 : Math.exp(-(t - dur) * 5));
  const trem = 1 + 0.08 * Math.sin(TAU * 5.2 * t);
  let v = 0;
  for (const [h, g] of [[1, 1], [2, 0.5], [3, 0.35], [4, 0.18], [6, 0.08], [8, 0.05]]) v += g * Math.sin(TAU * f * h * t);
  return env * trem * v * 0.42;
}
// Distant thunder: filtered noise rumble with a crack at the start, rolling away.
let lp1 = 0, lp2 = 0;
function thunder(f, t, dur) {
  if (t === 0) { lp1 = 0; lp2 = 0; }
  const n = noise();
  lp1 += 0.035 * (n - lp1); lp2 += 0.035 * (lp1 - lp2);
  const crack = t < 0.09 ? noise() * Math.exp(-t * 40) * 0.5 : 0;
  const roll = 1 + 0.6 * Math.sin(TAU * 3.1 * t) * Math.sin(TAU * 0.7 * t);
  const env = Math.min(1, t / 0.02) * Math.exp(-t * (2.2 / dur));
  return (lp2 * 7 * roll + crack) * env;
}
// Sleigh bells: bursts of high metallic partials with a noisy shimmer, shaken.
function jingle(f, t, dur) {
  const shake = Math.max(0, Math.sin(TAU * 7 * t)) ** 3; // seven shakes a second
  let v = 0;
  for (const r of [1, 1.47, 2.09, 2.63, 3.41]) v += Math.sin(TAU * f * r * t + 3 * Math.sin(TAU * f * 0.51 * t));
  const env = Math.min(1, t / 0.005) * (t < dur ? 1 : Math.exp(-(t - dur) * 8));
  return env * shake * (v * 0.12 + noise() * 0.08);
}
// Firework pop: a sharp noise burst with a low thump.
function pop(f, t) {
  return Math.exp(-t * 30) * (noise() * 0.8 + Math.sin(TAU * 70 * t) * 0.6);
}
Object.assign(VOICES, { organ, thunder, jingle, pop });

const roll = (voice, midis, step, dur, gain, at = 0) => midis.map((m, i) => [voice, m, at + i * step, dur, gain, i % 2 ? 0.35 : -0.35]);

const SOUNDS = {
  // D-F-Ab-B (diminished 7th) on organ, a G#6 glass bell clashing on top, thunder rolling in underneath.
  sound_h_halloween: [[
    ['organ', 50, 0, 1.1, 0.34], ['organ', 53, 0, 1.1, 0.3], ['organ', 56, 0.04, 1.1, 0.3], ['organ', 59, 0.08, 1.1, 0.26],
    ['sub', 38, 0, 1.2, 0.45], ['crystal', 92, 0.35, 1.1, 0.24, 0.5], ['crystal', 91, 0.42, 1.1, 0.2, -0.5],
    ['thunder', 40, 0.6, 1.3, 0.55],
  ], { tail: 0.8, wet: 0.4, delay: 0.3, fb: 0.35, maxLen: 2.4 }],
  // Jingle Bells: E E E . E E E on a glass bell, sleigh bells shaking all through, a little sub on the beat.
  sound_h_christmas: [[
    ['jingle', 96, 0, 1.6, 0.5],
    ...[0, 0.18, 0.36, 0.66, 0.84, 1.02].map((at) => ['crystal', 88, at, 0.32, 0.42, 0]),
    ['crystal', 91, 1.3, 0.5, 0.42], ['sub', 40, 0, 0.5, 0.35], ['sub', 40, 0.66, 0.5, 0.35],
  ], { tail: 0.6, wet: 0.28, maxLen: 2.2 }],
  // Happy Birthday's opening (G G A G C B) on crystal, sparkle at the end.
  sound_h_birthday: [[
    ...[[79, 0], [79, 0.16], [81, 0.3], [79, 0.55], [84, 0.8], [83, 1.05]].map(([m, at]) => ['crystal', m, at, 0.4, 0.45, 0]),
    ['sub', 36, 0, 0.6, 0.35], ['sub', 36, 0.8, 0.7, 0.4], ['sparkle', 96, 1.15, 0.6, 0.18, 0.4],
  ], { tail: 0.7, wet: 0.3, maxLen: 2.2 }],
  // A rising whistle, a pop, crackle, and a bright glass chord blooming.
  sound_h_newyear: [[
    ['riser', 66, 0, 0.55, 0.3], ['pop', 50, 0.55, 0.2, 0.7], ['sub', 36, 0.55, 0.8, 0.5],
    ...roll('crystal', [84, 88, 91, 96], 0.04, 0.9, 0.36, 0.6), ['sparkle', 98, 0.7, 0.8, 0.22, 0.4],
  ], { tail: 0.8, wet: 0.32, maxLen: 2.2 }],
};

const here = dirname(fileURLToPath(import.meta.url));
const RAW = join(here, '../app/src/main/res/raw');
const WEB = join(here, '../../fedha/public/sounds');
for (const [name, [notes, opts]] of Object.entries(SOUNDS)) {
  const file = join(RAW, `${name}.wav`);
  writeFileSync(file, render(notes, { ...opts, eq: true }));
  if (existsSync(WEB)) copyFileSync(file, join(WEB, `${name.replace('sound_h_', 'h-')}.wav`));
}
console.log('wrote', Object.keys(SOUNDS).join(', '));
