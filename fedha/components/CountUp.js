import { useEffect, useRef, useState } from 'react';

// A number that rolls up to its value (and glides between values when it changes), like a banking app's balance.
// format(n) renders it, e.g. (n) => formatCurrency(n, 'KES'). Instant when the phone asks for reduced motion.
export default function CountUp({ value = 0, format = (n) => String(Math.round(n)), duration = 1100, className, style }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const to = Number(value) || 0;
    const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (still) { setShown(to); from.current = to; return undefined; }
    const start = performance.now(); const a = from.current;
    let raf = 0;
    const tick = (now) => {
      const k = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - k, 4); // fast then settles
      const v = a + (to - a) * e;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick); else from.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = to; };
  }, [value, duration]);
  return <span className={`lx-count ${className || ''}`} style={style}>{format(shown)}</span>;
}
