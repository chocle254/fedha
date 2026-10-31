import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

// Each wealth tier's own living motion, behind every money screen: drifting glows plus a particle signature
// (Sapphire bubbles, Amethyst orbs, Rose Gold petals, Gold dust, Platinum light beams, Black Card glinting
// pinstripes, Diamond sparkles, Royal glitter, Imperial embers) and slow light rays from Gold up.
// Only transform and opacity animate (smooth on a phone), a modest number of particles, off with reduced motion.
// Rendered at the end of <body> so it sits over the wallpaper and under the screen's content.
const MOOD = {
  sapphire: { glows: ['59,130,246', '30,64,175'], p: { kind: 'bubble', n: 14, rgb: '147,197,253' } },
  amethyst: { glows: ['139,92,246', '91,33,182'], p: { kind: 'orb', n: 12, rgb: '196,181,253' } },
  rosegold: { glows: ['244,114,182', '183,110,121'], p: { kind: 'petal', n: 14, rgb: '251,207,232' } },
  gold: { glows: ['245,196,81', '146,100,10'], rays: '253,230,138', p: { kind: 'dust', n: 22, rgb: '253,224,71' } },
  platinum: { glows: ['209,213,219', '75,85,99'], p: { kind: 'beam', n: 3, rgb: '255,255,255' }, extra: { kind: 'speck', n: 10, rgb: '229,231,235' } },
  obsidian: { glows: ['233,196,106'], spot: true, p: { kind: 'glint', n: 9, rgb: '233,196,106' } },
  diamond: { glows: ['125,211,252', '14,116,144'], rays: '224,242,254', p: { kind: 'sparkle', n: 20, rgb: '224,242,254' } },
  royal: { glows: ['124,58,237', '251,191,36'], rays: '251,191,36', p: { kind: 'glitter', n: 20, rgb: '253,224,71' } },
  imperial: { glows: ['220,38,38', '252,211,77'], rays: '252,211,77', p: { kind: 'ember', n: 22, rgb: '251,146,60' } },
};

// Stable pseudo-random numbers, so particles don't jump on every render.
const rnd = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

function particles({ kind, n, rgb }, salt = 0) {
  return Array.from({ length: n }, (_, i) => {
    const r = (k) => rnd(i + salt * 50, k);
    const style = { '--x': `${(r(1) * 100).toFixed(1)}%`, '--y': `${(r(2) * 100).toFixed(1)}%`, '--d': `${(kind === 'beam' ? 9 : kind === 'glint' ? 6 : 10) + r(3) * 12}s`, '--delay': `${-(r(4) * 20).toFixed(1)}s`, '--sway': `${((r(5) - 0.5) * 30).toFixed(1)}vw`, '--rgb': rgb };
    const size = { bubble: 6 + r(6) * 14, orb: 10 + r(6) * 22, petal: 10 + r(6) * 10, dust: 2 + r(6) * 3, speck: 2 + r(6) * 2, sparkle: 8 + r(6) * 12, glitter: 3 + r(6) * 4, ember: 2 + r(6) * 4, glint: 1, beam: 1 }[kind];
    style['--s'] = `${size.toFixed(1)}px`;
    if (kind === 'glint') { style['--x'] = `${((i + 0.5) / n) * 100}%`; style['--delay'] = `${-(i * 0.7).toFixed(1)}s`; }
    return <i key={`${kind}${i}`} className={`tm-p tm-${kind}`} style={style} />;
  });
}

export default function TierMotion({ tierKey }) {
  const [host, setHost] = useState(null);
  useEffect(() => { setHost(document.body); }, []);
  const mood = MOOD[tierKey];
  const layer = useMemo(() => (mood ? (
    <div key={tierKey} className={`tm tm-${tierKey}`} aria-hidden="true">
      {mood.glows.map((g, i) => <b key={g} className="tm-glow" style={{ '--rgb': g, '--gx': i ? '75%' : '15%', '--gy': i ? '70%' : '10%', '--d': `${22 + i * 9}s` }} />)}
      {mood.spot && <b className="tm-spot" />}
      {mood.rays && <b className="tm-rays" style={{ '--rgb': mood.rays }} />}
      {particles(mood.p)}
      {mood.extra && particles(mood.extra, 1)}
    </div>
  ) : null), [tierKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!host || !layer) return null;
  return createPortal(layer, host);
}
