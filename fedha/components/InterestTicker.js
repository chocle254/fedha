import { useEffect, useRef } from 'react';

// Interest building up live: what the locked savings have earned since midnight (perDay × share of the day gone),
// ticking every frame with enough decimals to see the money move. Writes the number straight into the text node
// (no React re-render per frame) and stops while the app is hidden, so it costs next to nothing.
export default function InterestTicker({ perDay, decimals = 6, prefix = 'KSh ', style, className }) {
  const el = useRef(null);
  useEffect(() => {
    if (!(perDay > 0) || !el.current) return undefined;
    let raf = 0;
    const draw = () => {
      const now = new Date();
      const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
      const earned = perDay * ((now - midnight) / 864e5);
      if (el.current) el.current.textContent = `${prefix}${earned.toFixed(decimals)}`;
      raf = requestAnimationFrame(draw);
    };
    const vis = () => { cancelAnimationFrame(raf); if (!document.hidden) raf = requestAnimationFrame(draw); };
    document.addEventListener('visibilitychange', vis);
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', vis); };
  }, [perDay, decimals, prefix]);
  if (!(perDay > 0)) return null;
  return <span ref={el} className={`font-num ${className || ''}`} style={{ fontVariantNumeric: 'tabular-nums', ...style }}>{prefix}{(0).toFixed(decimals)}</span>;
}
