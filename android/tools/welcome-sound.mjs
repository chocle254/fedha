// "Welcome to Luxe": the start-up ident played when the app opens (~3.4 s).
// A soft whoosh and a deep sub swell, an airline-style two-tone crystal chime ("bing-bong"),
// then a rolled glass Dmaj9 blooming over a warm pad, with sparkle on top.
// Run: node android/tools/welcome-sound.mjs <out.wav>   (then ffmpeg to mp3 for the web and the app)
import { writeFileSync } from 'fs';
import { render } from './make-sounds.mjs';
import './make-sound-pack.mjs';   // crystal
import './make-sound-pack-2.mjs'; // subdeep, glass

const notes = [
  ['sweep', 50, 0, 0.7, 0.18],
  ['~subdeep', 26, 0, 0.6, 0.55], ['subdeep', 26, 0.6, 2.6, 0.75],
  ['pad', 62, 0.3, 2.8, 0.14, -0.4], ['pad', 69, 0.3, 2.8, 0.12, 0.4], ['pad', 66, 0.5, 2.6, 0.1, 0],
  ['crystal', 86, 0.6, 0.9, 0.5, -0.25],          // bing
  ['crystal', 81, 1.0, 1.1, 0.5, 0.25],           // bong
  ['knock', 86, 1.45, 0.1, 0.12],
  ...[74, 78, 81, 85, 88].map((m, i) => ['crystal', m, 1.45 + i * 0.07, 1.6, 0.3, -0.6 + i * 0.3]),
  ['sparkle', 93, 1.85, 1.0, 0.14, 0.5], ['sparkle', 98, 2.05, 0.9, 0.1, -0.5],
];

const out = process.argv[2];
if (!out) { console.error('usage: node welcome-sound.mjs <out.wav>'); process.exit(1); }
writeFileSync(out, render(notes, { tail: 1.2, wet: 0.3, delay: 0.18, fb: 0.35, maxLen: 3.4 }));
console.log('wrote', out);
