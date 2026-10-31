import { useEffect, useRef } from 'react';

// Interest building up live, ticking every frame with enough decimals to see the money move. With `base` and
// `from` it is a running total that never resets: base (all interest already paid) + perDay × days since `from`
// (the start of the day not yet paid). Without them it is what has built up since midnight. Writes the number straight into the text node
// (no React re-render per frame) and stops while the app is hidden, so it costs next to nothing.
export default function InterestTicker({ perDay, base = 0, from = null, decimals = 6, prefix = 'KSh ', style, className }) {
  const el = useRef(null);
  useEffect(() => {
    if (!(perDay > 0) || !el.current) return undefined;
    let raf = 0;
    const draw = () => {
      const now = new Date();
      const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
      const earned = (Number(base) || 0) + perDay * (Math.max(0, now - (from ?? midnight)) / 864e5);
      if (el.current) el.current.textContent = `${prefix}${earned.toFixed(decimals)}`;
      raf = requestAnimationFrame(draw);
    };
    const vis = () => { cancelAnimationFrame(raf); if (!document.hidden) raf = requestAnimationFrame(draw); };
    document.addEventListener('visibilitychange', vis);
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', vis); };
  }, [perDay, base, from, decimals, prefix]);
  if (!(perDay > 0) && !(Number(base) > 0)) return null; // nothing earning: still show what was earned
  return <span ref={el} className={`font-num ${className || ''}`} style={{ fontVariantNumeric: 'tabular-nums', ...style }}>{prefix}{(Number(base) || 0).toFixed(decimals)}</span>;
}
