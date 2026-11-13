import { useEffect, useState } from 'react';

// Planner → 🪩 Tonight, on a Saturday with no night out (not due yet, or the cash for one isn't there):
// the cheap reward instead. KSh 100 of weed, snacks you already have, the Chill Room, and a calm finish.
// The planner's 🌿 blocks link here (/planner#weed-night).
export const WEED_PRICE = 100;
const kes = (n) => `KSh ${Math.round(Number(n) || 0).toLocaleString('en-KE')}`;

export default function WeedNight({ floating = 0, reason = '' }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const go = () => {
      if (window.location.hash !== '#weed-night') return;
      setOpen(true);
      setTimeout(() => document.getElementById('weed-night')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    };
    go(); window.addEventListener('hashchange', go);
    return () => window.removeEventListener('hashchange', go);
  }, []);
  const can = floating >= WEED_PRICE;
  const steps = [
    ['🛒', 'Before dark', `Pick up your ${kes(WEED_PRICE)} and the snacks while it's still light. Carry only that amount, leave the rest at home.`],
    ['🍲', 'Eat first', 'Have a proper dinner before the first smoke. Snacks are for later.'],
    ['🌿', 'One session', 'Roll it, step out, enjoy it. Water bottle next to you.'],
    ['📺', 'Chill Room', 'A movie or a run of episodes, already picked so you aren\'t scrolling for an hour.'],
    ['🧭', 'Keep it clean', 'No alcohol on top tonight (together they hit much harder), and no trades, bets or money moves while high. They can wait for the morning.'],
    ['🌙', 'Wind down', 'Water, phone on charge, bed by the usual time. A good night that cost almost nothing.'],
  ];
  return (
    <div id="weed-night" className="card" style={{ marginBottom: 12, scrollMarginTop: 80 }}>
      <button onClick={() => setOpen((o) => !o)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center', width: '100%' }}>
        <span style={{ fontSize: 24 }}>🌿</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Weed night in · {kes(WEED_PRICE)}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{reason || 'Tonight\'s plan: on your schedule. Tap for how it goes.'}</div>
        </div>
        <span style={{ color: 'var(--text-3)' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style={{ marginTop: 12 }}>
          {!can && <div style={{ fontSize: 12, color: '#FCD34D', marginBottom: 10 }}>Free cash is under {kes(WEED_PRICE)} right now, so tonight is the Chill Room with what you have at home.</div>}
          {steps.map(([e, t, d]) => (
            <div key={t} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border, rgba(255,255,255,.08))' }}>
              <span style={{ fontSize: 18 }}>{e}</span>
              <div><div style={{ fontSize: 13, fontWeight: 700 }}>{t}</div><div style={{ fontSize: 12, color: 'var(--text-2, var(--text-3))' }}>{d}</div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
