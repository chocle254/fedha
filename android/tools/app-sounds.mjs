// The app's notification sounds, chosen from the pick-lists. Writes android/app/src/main/res/raw/*.wav.
// Run: node android/tools/app-sounds.mjs
//   sound_success  S20 ambient     TP hit, NestLink withdrawal
//   sound_alert    F02 tape-stop   SL hit, UpesiPay low, NestLink withdrawal failed
//   sound_planner  23 moonstone    planner reminders
//   sound_jarvis   12 nebula       Jarvis and other
//   sound_entry    10 zero-g       trade placed / filled
// S20 and F02 were made for headphones; here they get the phone-speaker master (same sound, the mid-range
// pushed so it carries on the speaker; the sub is still there on earbuds).
import { writeFileSync, readdirSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { render } from './make-sounds.mjs';
import { PACK } from './make-sound-pack.mjs';
import { S, F } from './make-sound-pack-2.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../app/src/main/res/raw');
const pack1 = (name) => { const p = PACK.find(([n]) => n === name); return [p[2], p[3]]; };
const speaker = ([notes, opts]) => [notes, { ...opts, eq: true }];

const APP = {
  sound_success: speaker(S.ambient(0)),
  sound_alert: speaker(F.tapestop(1)),
  sound_planner: pack1('23-moonstone'),
  sound_jarvis: pack1('12-nebula'),
  sound_entry: pack1('10-zero-g'),
};

for (const f of readdirSync(OUT)) if (f.startsWith('sound_') && f.endsWith('.wav')) unlinkSync(join(OUT, f));
for (const [name, [notes, opts]] of Object.entries(APP)) writeFileSync(join(OUT, `${name}.wav`), render(notes, opts));
console.log('wrote', Object.keys(APP).join(', '));
