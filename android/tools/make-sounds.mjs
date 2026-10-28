// Generates the app's notification sounds (res/raw/*.wav). Run: node android/tools/make-sounds.mjs
// Each sound is a few bell-like notes: a sine with soft overtones, a quick attack and an exponential fade.
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const RATE = 22050;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../app/src/main/res/raw');

// notes: [frequency Hz, start s, length s, volume 0-1]
function render(notes) {
  const len = Math.ceil(RATE * Math.max(...notes.map(([, s, l]) => s + l)) + RATE * 0.05);
  const buf = new Float32Array(len);
  for (const [f, start, dur, vol] of notes) {
    const s0 = Math.floor(start * RATE);
    const n = Math.floor(dur * RATE);
    for (let i = 0; i < n && s0 + i < len; i++) {
      const t = i / RATE;
      const env = Math.min(1, t / 0.006) * Math.exp((-4.5 * t) / dur);
      const v = Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t) + 0.12 * Math.sin(6 * Math.PI * f * t);
      buf[s0 + i] += vol * env * v * 0.55;
    }
  }
  const pcm = Buffer.alloc(44 + len * 2);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + len * 2, 4); pcm.write('WAVE', 8); pcm.write('fmt ', 12);
  pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22); pcm.writeUInt32LE(RATE, 24);
  pcm.writeUInt32LE(RATE * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(len * 2, 40);
  for (let i = 0; i < len; i++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i])) * 32000), 44 + i * 2);
  return pcm;
}

const SOUNDS = {
  // Money withdrawn: bright "cha-ching", two quick high notes then a ringing chord.
  sound_nestlink: [[1319, 0, 0.09, 0.8], [1760, 0.09, 0.09, 0.8], [2093, 0.2, 0.9, 0.7], [2637, 0.2, 0.9, 0.35]],
  // UpesiPay low: falling two-tone warning, played twice.
  sound_upesipay: [[880, 0, 0.22, 0.9], [659, 0.24, 0.3, 0.9], [880, 0.62, 0.22, 0.9], [659, 0.86, 0.4, 0.9]],
  // Trade entered: confident rising pair.
  sound_trade: [[659, 0, 0.18, 0.8], [988, 0.16, 0.45, 0.8]],
  // Take-profit: happy quick arpeggio up.
  sound_tp: [[1047, 0, 0.12, 0.7], [1319, 0.09, 0.12, 0.7], [1568, 0.18, 0.12, 0.7], [2093, 0.27, 0.6, 0.7]],
  // Stop-loss: low falling notes.
  sound_sl: [[440, 0, 0.3, 0.9], [349, 0.28, 0.3, 0.9], [262, 0.56, 0.7, 0.9]],
  // Planner: one soft chime.
  sound_planner: [[880, 0, 0.8, 0.5], [1320, 0, 0.5, 0.15]],
};

for (const [name, notes] of Object.entries(SOUNDS)) writeFileSync(join(OUT, `${name}.wav`), render(notes));
console.log('wrote', Object.keys(SOUNDS).length, 'sounds to', OUT);
