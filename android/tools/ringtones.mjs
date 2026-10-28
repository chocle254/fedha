// Futuristic deep-bass ringtones (~20-30 s, loop-friendly), composed with a tiny step sequencer on the
// same engine and instruments as the notification sounds. Mastered for the phone speaker (rings out loud)
// with the full sub kept underneath for earbuds.
// Run: node android/tools/ringtones.mjs <output folder>   (writes .wav; convert with ffmpeg)
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { render } from './make-sounds.mjs';
import './make-sound-pack-2.mjs'; // registers kick, clap, hat, shaker, logdrum, 808s, reese, vox, glass, chirp...

const CH = { maj9: [0, 4, 7, 11, 14], maj7: [0, 4, 7, 11], add9: [0, 4, 7, 14], m9: [0, 3, 7, 10, 14], m7: [0, 3, 7, 10], m: [0, 3, 7], maj: [0, 4, 7], sus2: [0, 2, 7], six9: [0, 4, 9, 14], m11: [0, 3, 7, 10, 17] };

// A song: bpm, bars, and parts that add notes. t(bar, step) gives the time of a 16th-note step (with swing).
function song({ bpm, bars, swing = 0 }, build) {
  const s16 = 60 / bpm / 4;
  const t = (bar, step) => (bar * 16 + step) * s16 + (step % 2 ? swing * s16 : 0);
  const notes = [];
  const add = (...n) => notes.push(...n);
  const drum = (voice, pattern, gain, every = [...Array(bars).keys()], midi = 0) => {
    for (const bar of every) [...pattern].forEach((c, i) => { if (c !== '.') add([voice, midi, t(bar, i), 0.3, gain * (c === 'X' ? 1.2 : 1), 0]); });
  };
  const chords = (voice, prog, gain, len = 16, spread = 0.015, everyStep = 16) => {
    prog.forEach(([root, type], bar) => {
      for (let st = 0; st < 16; st += everyStep) CH[type].forEach((iv, i) => add([voice, root + iv, t(bar, st) + i * spread, (len * s16), gain, -0.6 + (1.2 * i) / (CH[type].length - 1)]));
    });
  };
  const line = (voice, events, gain, pan = 0) => events.forEach(([bar, step, midi, len]) => add([voice, midi, t(bar, step), len * s16, gain, typeof pan === 'function' ? pan(step) : pan]));
  build({ t, add, drum, chords, line, s16, bars });
  return { notes, length: bars * 16 * s16 };
}

// Repeats a one-bar (or n-bar) phrase across bars, transposing it with the chord roots.
const repeat = (phrase, roots, phraseBars = 1) => roots.flatMap((r, bar) => (bar % phraseBars ? [] : phrase.map(([b, st, iv, len]) => [bar + b, st, r + iv, len])));

const RINGTONES = {
  // 1. Synthwave night drive: four-on-the-floor, 808 pulse, lush chords, a glass arpeggio on top.
  'neon-drive': () => song({ bpm: 100, bars: 10 }, ({ drum, chords, line }) => {
    const prog = [[50, 'add9'], [57, 'maj'], [59, 'm7'], [55, 'maj9']];
    const P = [...prog, ...prog, prog[0], prog[1]];
    drum('kick', 'x...x...x...x...', 0.9);
    drum('clap', '....x.......x...', 0.45, [2, 3, 4, 5, 6, 7, 8, 9]);
    drum('hat', '..x...x...x...x.', 0.35, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    chords('pad', P, 0.16);
    chords('rhodes', P, 0.22, 3, 0.02, 4);
    line('s808', P.map(([r], bar) => [bar, 0, r - 24, 14]), 0.75);
    line('glass', repeat([[0, 0, 12, 2], [0, 3, 19, 2], [0, 6, 24, 2], [0, 8, 26, 2], [0, 11, 19, 2], [0, 14, 16, 2]], P.map(([r]) => r)), 0.28, (st) => (st % 4 ? 0.5 : -0.5));
  }),

  // 2. Amapiano sunset: log drum melody, shakers, jazzy keys and a deep sub.
  'amapiano-sunset': () => song({ bpm: 112, bars: 12, swing: 0.12 }, ({ drum, chords, line }) => {
    const prog = [[53, 'maj9'], [50, 'm9'], [55, 'm9'], [48, 'six9']];
    const P = [...prog, ...prog, ...prog];
    drum('kick', 'x.......x.......', 0.85);
    drum('shaker', 'x.xxx.xxx.xxx.xx', 0.3);
    drum('clap', '....x.......x...', 0.35, [4, 5, 6, 7, 8, 9, 10, 11]);
    chords('rhodes', P, 0.24, 6, 0.025, 8);
    chords('pad', P, 0.12);
    line('logdrum', repeat([[0, 0, -12, 3], [0, 3, -12, 2], [0, 6, -5, 3], [0, 10, 0, 2], [0, 12, -10, 3], [0, 14, -7, 2]], P.map(([r]) => r)), 0.8);
    line('subdeep', P.map(([r], bar) => [bar, 0, r - 24, 15]), 0.45);
    line('glass', [[8, 0, 77, 4], [8, 6, 81, 4], [9, 0, 84, 6], [10, 4, 81, 4], [11, 0, 77, 8]], 0.28, 0.3);
  }),

  // 3. Lo-fi orbit: lazy drums, Rhodes 9ths, vinyl, a glass melody drifting on top.
  'lofi-orbit': () => song({ bpm: 80, bars: 8, swing: 0.18 }, ({ drum, chords, line }) => {
    const prog = [[52, 'm9'], [57, 'm9'], [50, 'maj9'], [55, 'maj7']];
    const P = [...prog, ...prog];
    drum('kick', 'x......x..x.....', 0.8);
    drum('clap', '....x.......x...', 0.35);
    drum('hat', 'x.x.x.x.x.x.x.x.', 0.22);
    chords('rhodes', P, 0.3, 14, 0.035);
    line('subdeep', P.map(([r], bar) => [bar, 0, r - 24, 15]), 0.7);
    line('glass', [[1, 0, 76, 3], [1, 4, 79, 3], [1, 8, 83, 6], [3, 0, 81, 3], [3, 6, 79, 6], [5, 0, 76, 3], [5, 4, 79, 3], [5, 8, 86, 6], [7, 0, 83, 8]], 0.3, 0.25);
  }),

  // 4. Trap halo: half-time 808 slides, rolling hats, a minor glass-bell hook.
  'trap-halo': () => song({ bpm: 140, bars: 12 }, ({ drum, line }) => {
    const roots = [45, 45, 41, 43, 45, 45, 41, 40, 45, 45, 41, 43];
    drum('kick', 'x.........x.....', 0.9);
    drum('clap', '........x.......', 0.5);
    drum('hat', 'x.x.x.xxx.x.x.xx', 0.3, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    line('g808', roots.map((r, bar) => [bar, 0, r - 12, 10]), 0.95);
    line('glass', repeat([[0, 0, 24, 2], [0, 2, 27, 2], [0, 4, 31, 3], [0, 8, 29, 2], [0, 10, 27, 2], [0, 12, 24, 4]], roots, 2), 0.32, (st) => (st < 8 ? -0.4 : 0.4));
    line('pad', roots.map((r, bar) => [bar, 0, r + 24, 16]), 0.12);
  }),

  // 5. Future garage rain: shuffled drums, "ahh" vocal chops, a reese bass and wide pads.
  'garage-rain': () => song({ bpm: 132, bars: 12, swing: 0.25 }, ({ drum, chords, line }) => {
    const prog = [[49, 'm9'], [45, 'maj7'], [47, 'six9'], [44, 'm7']];
    const P = [...prog, ...prog, ...prog];
    drum('kick', 'x.........x.....', 0.85);
    drum('clap', '....x.......x...', 0.45);
    drum('hat', '..x...x.x.x...x.', 0.3);
    chords('pad', P, 0.17);
    line('reese', P.map(([r], bar) => [bar, 0, r - 12, 15]), 0.4);
    line('voxah', repeat([[0, 0, 24, 2], [0, 6, 31, 2], [0, 10, 27, 3]], P.map(([r]) => r)), 0.38, (st) => (st % 3 ? 0.45 : -0.45));
  }),

  // 6. Tokyo 2099: pentatonic glass plucks over a techno pulse and chirping machines.
  'tokyo-2099': () => song({ bpm: 124, bars: 12 }, ({ drum, line }) => {
    const penta = [0, 2, 5, 7, 9, 12, 14, 17];
    const root = 62;
    drum('kick', 'x...x...x...x...', 0.9);
    drum('hat', '..x...x...x...x.', 0.32);
    drum('clap', '....x.......x...', 0.35, [4, 5, 6, 7, 8, 9, 10, 11]);
    line('subdeep', [...Array(12).keys()].map((bar) => [bar, 0, (bar % 4 === 3 ? 33 : 38), 15]), 0.65);
    const motif = [0, 2, 4, 3, 5, 4, 2, 1, 0, 3, 5, 7, 6, 4, 3, 1];
    line('pluck2', [...Array(12).keys()].flatMap((bar) => motif.map((d, st) => (st % 2 ? null : [bar, st, root + penta[(d + (bar % 4 === 2 ? 1 : 0)) % penta.length], 2])).filter(Boolean)), 0.5, (st) => (st % 4 ? 0.5 : -0.5));
    line('chirp', [[3, 14, 98, 1], [7, 14, 101, 1], [11, 12, 98, 1], [11, 14, 103, 1]], 0.2, 0.6);
  }),

  // 7. Afro future: afro-house groove, log drums and a bright glass marimba line.
  'afro-future': () => song({ bpm: 122, bars: 12, swing: 0.08 }, ({ drum, chords, line }) => {
    const prog = [[57, 'm7'], [53, 'maj7'], [55, 'six9'], [52, 'm7']];
    const P = [...prog, ...prog, ...prog];
    drum('kick', 'x...x...x...x...', 0.85);
    drum('shaker', '.xx..xx..xx..xx.', 0.3);
    drum('clap', '....x.......x...', 0.35, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    line('logdrum', repeat([[0, 0, -12, 2], [0, 4, -5, 2], [0, 7, 0, 2], [0, 10, -12, 2], [0, 12, -7, 3]], P.map(([r]) => r)), 0.7);
    chords('pad', P, 0.13);
    line('glass', repeat([[0, 2, 12, 1], [0, 5, 15, 1], [0, 8, 19, 1], [0, 11, 17, 1], [0, 14, 15, 1]], P.map(([r]) => r)), 0.3, (st) => (st % 3 ? 0.5 : -0.5));
  }),

  // 8. Deep space: slow and gentle. Singing-bowl glass, swelling pads and a huge sub.
  'deep-space': () => song({ bpm: 70, bars: 7 }, ({ chords, line }) => {
    const prog = [[50, 'maj9'], [47, 'm9'], [55, 'maj7'], [52, 'm11'], [50, 'maj9'], [47, 'm9'], [55, 'maj7']];
    chords('pad', prog, 0.2);
    line('subdeep', prog.map(([r], bar) => [bar, 0, r - 24, 16]), 0.85);
    line('glass', prog.map(([r], bar) => [bar, 0, r + 24, 14]), 0.35, 0.3);
    line('glass', [[0, 8, 86, 6], [1, 4, 83, 6], [2, 8, 90, 8], [3, 4, 88, 6], [4, 8, 86, 6], [5, 4, 83, 6], [6, 0, 81, 12]], 0.25, -0.3);
  }),
};

const out = process.argv[2];
if (!out) { console.error('usage: node ringtones.mjs <output folder>'); process.exit(1); }
mkdirSync(out, { recursive: true });
const only = process.argv[3];
for (const [name, make] of Object.entries(RINGTONES)) {
  if (only && only !== name) continue;
  const t0 = Date.now();
  const { notes, length } = make();
  const wav = render(notes, { tail: 0, maxLen: length, wet: 0.2, delay: 0.08, fb: 0.25, crackle: name === 'lofi-orbit' ? 0.006 : 0.0015 });
  writeFileSync(join(out, `${name}.wav`), wav);
  console.log(`${name}: ${length.toFixed(1)} s, ${notes.length} notes, ${((Date.now() - t0) / 1000).toFixed(0)} s to render`);
}
