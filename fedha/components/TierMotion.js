import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Aquarium from './Aquarium';
import TierWorld from './TierWorld';

// The living background on the money screens: ONLY the current mood is built (your tier's, or today's holiday,
// which takes over the motion for the day). A mood is one or two soft glows plus a few emitters of real-looking
// things. The tiers themselves are 3D worlds now (Sapphire's aquarium, then one world per tier); the emitters
// below are what holidays use. Holidays: lib/holidays.js.
// Only transform and opacity animate, about 15-25 things on screen, nothing when motion is reduced.
export const MOODS = {
  // Sapphire is an aquarium: real 3D sea life and bubbles behind the screen (components/Aquarium.js).
  sapphire: { aquarium: true, glows: [], emit: [] }, // the bubbles are inside the aquarium itself
  // Every tier above Sapphire is its own 3D world you travel through (components/TierWorld.js, components/worlds/),
  // each grander than the one before. The world is the whole background, so nothing else is drawn over it.
  amethyst: { world: 'amethyst', glows: [], emit: [] }, // a flight through a crystal cavern
  rosegold: { world: 'rosegold', glows: [], emit: [] }, // a sea of silk, ring gates and petals
  gold: { world: 'gold', glows: [], emit: [] },         // the aisle of an endless vault
  platinum: { world: 'platinum', glows: [], emit: [] }, // a chrome solar system
  obsidian: { world: 'obsidian', glows: [], emit: [] }, // a midnight city, your black card above it
  diamond: { world: 'diamond', glows: [], emit: [] },   // an ice plain and a mountain of diamond
  royal: { world: 'royal', glows: [], emit: [] },       // the throne hall and the crown
  imperial: { world: 'imperial', glows: [], emit: [] }, // a golden dragon over the mountains
};

const rnd = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
const STATIC = new Set(['sparkle', 'light', 'burst', 'beam', 'glint']);

// A firework: a ring of coloured sparks drawn with box-shadows on one dot (one layer, scaled and faded).
function burstShadow(color) {
  return Array.from({ length: 14 }, (_, k) => { const a = (k / 14) * Math.PI * 2; return `${(Math.cos(a) * 34).toFixed(1)}px ${(Math.sin(a) * 34).toFixed(1)}px 0 1.5px ${color}`; }).join(',');
}

function build(e, salt) {
  const out = [];
  for (let i = 0; i < e.n; i++) {
    const r = (k) => rnd(i + salt * 37, k);
    const [lo, hi] = e.size || [8, 16];
    const motion = e.motion || (STATIC.has(e.shape) ? 'still' : 'fall');
    const base = motion === 'flutter' ? 14 : motion === 'float' ? 16 : e.slow ? 16 : 10;
    const color = e.colors ? e.colors[Math.floor(r(7) * e.colors.length)] : null;
    const style = {
      '--x': `${(r(1) * 100).toFixed(1)}%`, '--y': `${(r(2) * 90 + 3).toFixed(1)}%`, '--s': `${(lo + r(3) * (hi - lo)).toFixed(1)}px`,
      '--d': `${(base + r(4) * base * 0.8).toFixed(1)}s`, '--delay': `${-(r(5) * 24).toFixed(1)}s`,
      '--sway': `${((r(6) - 0.5) * 30).toFixed(1)}vw`, '--spin': `${Math.round(200 + r(8) * 520) * (r(9) > 0.5 ? 1 : -1)}deg`,
      ...(color ? { '--c': color } : {}),
    };
    if (e.shape === 'glint') { style['--x'] = `${((i + 0.5) / e.n) * 100}%`; style['--delay'] = `${-(i * 0.8).toFixed(1)}s`; style['--d'] = '7s'; }
    if (e.shape === 'beam') { style['--d'] = `${9 + i * 3}s`; style['--delay'] = `${-(i * 4)}s`; }
    if (e.shape === 'burst') { style['--d'] = `${3 + r(4) * 2.5}s`; style.boxShadow = burstShadow(color || '#FDE68A'); style['--y'] = `${(r(2) * 55 + 8).toFixed(1)}%`; }
    const cls = `tm-p m-${motion} ${e.emoji ? 's-emoji' : `s-${e.shape}`}`;
    out.push(<i key={`${salt}-${i}`} className={cls} style={style}>{e.emoji ? e.emoji[Math.floor(r(10) * e.emoji.length)] : null}</i>);
  }
  return out;
}

export default function TierMotion({ moodKey, mood }) {
  const [host, setHost] = useState(null);
  useEffect(() => { setHost(document.body); }, []);
  const layer = useMemo(() => (mood ? (
    <div key={moodKey} className={`tm tm-${moodKey}`} aria-hidden="true">
      {mood.aquarium && <Aquarium />}
      {mood.world && <TierWorld kind={mood.world} />}
      {(mood.glows || []).slice(0, 2).map((g, i) => <b key={g} className="tm-glow" style={{ '--rgb': g, '--gx': i ? '80%' : '18%', '--gy': i ? '75%' : '12%', '--d': `${24 + i * 10}s` }} />)}
      {mood.spot && <b className="tm-spot" />}
      {mood.emit.map((e, k) => build(e, k + 1))}
    </div>
  ) : null), [moodKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!host || !layer) return null;
  return createPortal(layer, host);
}
