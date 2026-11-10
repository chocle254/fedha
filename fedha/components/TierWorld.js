import { useEffect, useRef } from 'react';

// The living 3D wallpaper of a wealth tier (lib/wealth-tiers.js). Each tier above Sapphire has its own world,
// grander than the one before: lose the money and you lose the view.
//   Amethyst   a glowing crystal cavern          Black Card  your black card turning in the dark
//   Rose Gold  rose-gold silk and falling petals Diamond     a great brilliant-cut diamond
//   Gold       the vault: bars and raining coins Royal       a jewelled crown on a velvet cushion
//   Platinum   a chrome orrery of spinning rings Imperial    a golden dragon chasing its pearl
// three.js and the one world needed are downloaded only for that tier. No WebGL: the tier's colours stay.
const WORLDS = {
  amethyst: () => import('./worlds/amethyst'),
  rosegold: () => import('./worlds/rosegold'),
  gold: () => import('./worlds/gold'),
  platinum: () => import('./worlds/platinum'),
  obsidian: () => import('./worlds/obsidian'),
  diamond: () => import('./worlds/diamond'),
  royal: () => import('./worlds/royal'),
  imperial: () => import('./worlds/imperial'),
};

export default function TierWorld({ kind }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!WORLDS[kind]) return undefined;
    let stop = false; let cleanup = () => {};
    Promise.all([import('three'), import('./worlds/kit'), WORLDS[kind]()]).then(([THREE, kit, world]) => {
      if (stop || !ref.current) return;
      try { cleanup = kit.boot(THREE, ref.current, world.default); } catch { cleanup = () => {}; }
    }).catch(() => {});
    return () => { stop = true; try { cleanup(); } catch { /* already gone */ } };
  }, [kind]);
  return <div ref={ref} className="aq" />;
}
