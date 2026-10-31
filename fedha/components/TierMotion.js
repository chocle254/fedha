import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

// The living background on the money screens: ONLY the current mood is built (your tier's, or today's holiday,
// which takes over the motion for the day). A mood is one or two soft glows plus a few emitters of real-looking
// things: Sapphire bubbles and drops, Amethyst crystals, Rose Gold petals and roses, Gold coins and dust,
// Platinum chrome coins and beams, Black Card falling black cards and gold glints, Diamond gems and sparkles,
// Royal crowns and glitter, Imperial embers and coins. Holidays: lib/holidays.js.
// Only transform and opacity animate, about 15-25 things on screen, nothing when motion is reduced.
export const MOODS = {
  sapphire: { glows: ['59,130,246'], emit: [{ shape: 'bubble', motion: 'rise', n: 12, size: [8, 22] }, { emoji: ['💧'], motion: 'fall', n: 5, size: [12, 18], slow: true }] },
  amethyst: { glows: ['139,92,246'], emit: [{ shape: 'crystal', motion: 'float', n: 8, size: [12, 24], colors: ['#A78BFA', '#C4B5FD', '#7C3AED'] }, { shape: 'sparkle', n: 10, size: [6, 12], colors: ['#DDD6FE'] }] },
  rosegold: { glows: ['244,114,182'], emit: [{ shape: 'petal', motion: 'fall', n: 12, size: [10, 18], colors: ['#FBCFE8', '#F9A8D4', '#E8A0A8'] }, { emoji: ['🌹'], motion: 'fall', n: 3, size: [16, 22], slow: true }] },
  gold: { glows: ['245,196,81'], emit: [{ shape: 'coin', motion: 'flip', n: 8, size: [14, 24] }, { shape: 'dust', motion: 'rise', n: 12, size: [2, 4], colors: ['#FDE047'] }] },
  platinum: { glows: ['209,213,219'], emit: [{ shape: 'beam', n: 3 }, { shape: 'chrome', motion: 'flip', n: 7, size: [14, 22] }, { shape: 'sparkle', n: 6, size: [6, 10], colors: ['#F9FAFB'] }] },
  obsidian: { glows: ['233,196,106'], spot: true, emit: [{ shape: 'glint', n: 8 }, { shape: 'card', motion: 'flip', n: 5, size: [26, 36], slow: true }] },
  diamond: { glows: ['125,211,252'], emit: [{ shape: 'gem', motion: 'flip', n: 8, size: [14, 24], colors: ['#E0F2FE', '#7DD3FC', '#BAE6FD'] }, { shape: 'sparkle', n: 14, size: [6, 14], colors: ['#FFFFFF'] }] },
  royal: { glows: ['124,58,237', '251,191,36'], emit: [{ emoji: ['👑'], motion: 'fall', n: 4, size: [18, 26], slow: true }, { shape: 'glitter', motion: 'fall', n: 16, size: [3, 6], colors: ['#FDE047', '#FBBF24'] }] },
  imperial: { glows: ['220,38,38'], emit: [{ shape: 'ember', motion: 'rise', n: 16, size: [2, 5], colors: ['#FB923C', '#FBBF24'] }, { shape: 'coin', motion: 'flip', n: 5, size: [14, 22] }] },
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
      {(mood.glows || []).slice(0, 2).map((g, i) => <b key={g} className="tm-glow" style={{ '--rgb': g, '--gx': i ? '80%' : '18%', '--gy': i ? '75%' : '12%', '--d': `${24 + i * 10}s` }} />)}
      {mood.spot && <b className="tm-spot" />}
      {mood.emit.map((e, k) => build(e, k + 1))}
    </div>
  ) : null), [moodKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!host || !layer) return null;
  return createPortal(layer, host);
}
