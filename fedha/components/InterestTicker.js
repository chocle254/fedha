import { useEffect, useRef } from 'react';

// Interest building up live, ticking 5 times a second with enough decimals to see the money move. With `base` and
// `from` it is a running total that never resets: base (all interest already paid) + perDay × days since `from`
// (the start of the day not yet paid). Without them it is what has built up since midnight. Writes the number straight into the text node
// (no React re-render per frame) and stops while the app is hidden, so it costs next to nothing.
export default function InterestTicker({ perDay, base = 0, from = null, decimals = 6, prefix = 'KSh ', style, className }) {
  const el = useRef(null);
  useEffect(() => {
    if (!(perDay > 0) || !el.current) return undefined;
    // 5 updates a second is enough to see the 6th decimal move; every frame (120 a second on a 120 Hz screen)
    // kept the phone busy. Stops while the app is hidden or the number is scrolled off screen.
    let t = 0; let onScreen = true;
    const draw = () => {
      const now = new Date();
      const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
      const earned = (Number(base) || 0) + perDay * (Math.max(0, now - (from ?? midnight)) / 864e5);
      if (el.current) el.current.textContent = `${prefix}${earned.toFixed(decimals)}`;
    };
    const tick = () => { draw(); t = setTimeout(tick, document.documentElement.classList.contains('lx-saver') ? 1000 : 200); };
    const start = () => { clearTimeout(t); if (!document.hidden && onScreen) tick(); };
    const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; start(); }) : null;
    io?.observe(el.current);
    document.addEventListener('visibilitychange', start);
    start();
    return () => { clearTimeout(t); io?.disconnect(); document.removeEventListener('visibilitychange', start); };
  }, [perDay, base, from, decimals, prefix]);
  if (!(perDay > 0) && !(Number(base) > 0)) return null; // nothing earning: still show what was earned
  return <span ref={el} className={`font-num ${className || ''}`} style={{ fontVariantNumeric: 'tabular-nums', ...style }}>{prefix}{(Number(base) || 0).toFixed(decimals)}</span>;
}
