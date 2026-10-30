import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { themeKeyFor, applyTheme } from '../lib/themes';

// The background behind every screen: a still wallpaper per section (public/bg/<theme>.webp, ~20 KB each, made
// from the section's colours: silk ribbons, plus a grid for markets and code, a projector beam for the Chill Room,
// a stage glow for music and workouts). Nothing animates, so scrolling stays smooth; changing section crossfades
// the two wallpapers once. Under the image is a gradient in the same colours, so the screen is never blank.
export default function Ambience() {
  const router = useRouter();
  const key = themeKeyFor(router.pathname);
  const off = router.pathname === '/reels' || router.pathname.startsWith('/certificate');
  const [layers, setLayers] = useState([{ key, id: 0 }]);
  const n = useRef(0);

  useEffect(() => {
    applyTheme(key);
    setLayers((ls) => (ls[ls.length - 1].key === key ? ls : [...ls.slice(-1), { key, id: ++n.current }]));
  }, [key]);

  useEffect(() => {
    if (layers.length < 2) return undefined;
    const t = setTimeout(() => setLayers((ls) => ls.slice(-1)), 700);
    return () => clearTimeout(t);
  }, [layers]);

  if (off) return null;
  return (
    <div className="lx-ambience" aria-hidden="true">
      {layers.map((l, i) => (
        <div key={l.id} className={`lx-wall ${i === layers.length - 1 && layers.length > 1 ? 'lx-wall-in' : ''}`} style={{ backgroundImage: `url(/bg/${l.key}.webp)` }} />
      ))}
      <div className="lx-grain" />
    </div>
  );
}
