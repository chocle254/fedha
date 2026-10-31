// Wealth tiers for the Home dashboard: as net worth crosses each mark, Home gets a classier background, accents and
// chart colours. Drawn in CSS (layered gradients and fine patterns), so there is nothing to download.
// Marks are in KSh, set to be reachable step by step (2k, 5k, 10k, 20k…). Reaching a tier for the first time is celebrated once (settings key 'wealth_tier_best').
const silk = (a, b, c) => `radial-gradient(120% 70% at 12% 0%, ${a} 0%, transparent 55%), radial-gradient(90% 70% at 95% 15%, ${b} 0%, transparent 60%), radial-gradient(80% 60% at 50% 110%, ${b} 0%, transparent 70%), ${c}`;
const sheen = (col, op = 0.07) => `repeating-linear-gradient(115deg, rgba(${col},${op}) 0 1px, transparent 1px 22px)`;
const sparkle = (col) => `radial-gradient(1.5px 1.5px at 20% 30%, rgba(${col},.9), transparent), radial-gradient(1px 1px at 70% 20%, rgba(${col},.8), transparent), radial-gradient(1.5px 1.5px at 40% 75%, rgba(${col},.7), transparent), radial-gradient(1px 1px at 85% 60%, rgba(${col},.9), transparent), radial-gradient(1px 1px at 10% 85%, rgba(${col},.6), transparent), radial-gradient(1.5px 1.5px at 60% 50%, rgba(${col},.5), transparent)`;
const pin = (col) => `repeating-linear-gradient(90deg, rgba(${col},.08) 0 1px, transparent 1px 46px)`;

export const TIERS = [
  { min: 0, key: 'emerald', name: 'Emerald', icon: '🌱', accent: '#34D399', accent2: '#6EE7B7', line: '#34D399', bg: null },
  { min: 2000, key: 'sapphire', name: 'Sapphire', icon: '💙', accent: '#60A5FA', accent2: '#93C5FD', line: '#60A5FA',
    bg: `${sheen('147,197,253', 0.05)}, ${silk('#1D4ED8', '#0B2A6B', '#020617')}` },
  { min: 5000, key: 'amethyst', name: 'Amethyst', icon: '💜', accent: '#A78BFA', accent2: '#C4B5FD', line: '#A78BFA',
    bg: `${sheen('196,181,253', 0.05)}, ${silk('#6D28D9', '#2E1065', '#07030F')}` },
  { min: 10000, key: 'rosegold', name: 'Rose Gold', icon: '🌹', accent: '#F9A8D4', accent2: '#FBCFE8', line: '#F4A3B4',
    bg: `${sheen('251,207,232', 0.06)}, ${silk('#B76E79', '#4A1D2A', '#0E0507')}` },
  { min: 20000, key: 'gold', name: 'Gold', icon: '🥇', accent: '#F5C451', accent2: '#FDE68A', line: '#F5C451',
    bg: `linear-gradient(125deg, transparent 30%, rgba(253,230,138,.08) 45%, transparent 60%), ${sheen('245,196,81', 0.06)}, ${silk('#B8860B', '#3D2A05', '#070502')}` },
  { min: 35000, key: 'platinum', name: 'Platinum', icon: '🪙', accent: '#E5E7EB', accent2: '#F9FAFB', line: '#D1D5DB',
    bg: `repeating-linear-gradient(0deg, rgba(255,255,255,.025) 0 1px, transparent 1px 3px), ${silk('#6B7280', '#1F2937', '#06070A')}` },
  { min: 50000, key: 'obsidian', name: 'Black Card', icon: '🖤', accent: '#E9C46A', accent2: '#F4E3B2', line: '#E9C46A',
    bg: `${pin('233,196,106')}, radial-gradient(100% 60% at 50% 0%, rgba(233,196,106,.12), transparent 60%), #000` },
  { min: 75000, key: 'diamond', name: 'Diamond', icon: '💎', accent: '#7DD3FC', accent2: '#E0F2FE', line: '#7DD3FC',
    bg: `${sparkle('224,242,254')}, ${sheen('186,230,253', 0.05)}, ${silk('#0E7490', '#0C2D48', '#01060C')}` },
  { min: 100000, key: 'royal', name: 'Royal', icon: '👑', accent: '#FBBF24', accent2: '#C4B5FD', line: '#FBBF24',
    bg: `${sparkle('253,230,138')}, ${pin('251,191,36')}, ${silk('#5B21B6', '#3B0764', '#0A0212')}` },
  { min: 150000, key: 'imperial', name: 'Imperial', icon: '🏛️', accent: '#FCD34D', accent2: '#FCA5A5', line: '#FCD34D',
    bg: `${sparkle('254,243,199')}, linear-gradient(125deg, transparent 30%, rgba(252,211,77,.10) 45%, transparent 60%), ${silk('#991B1B', '#450A0A', '#0A0202')}` },
];

export function tierFor(amount) {
  const n = Number(amount) || 0;
  let i = 0;
  for (let k = 0; k < TIERS.length; k++) if (n >= TIERS[k].min) i = k;
  const next = TIERS[i + 1] || null;
  const t = TIERS[i];
  return { ...t, index: i, next, toNext: next ? next.min - n : 0, pct: next ? Math.max(0, Math.min(100, ((n - t.min) / (next.min - t.min)) * 100)) : 100 };
}

const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`; };

// Puts the tier's accents and chart colours on <html>. Emerald clears the chart overrides (default greens).
export function applyTier(t) {
  if (typeof document === 'undefined' || !t) return;
  const s = document.documentElement.style;
  if (t.index === 0) { clearTier(); return; }
  s.setProperty('--tier-bg', t.bg);
  document.documentElement.dataset.tier = t.key;
  document.documentElement.dataset.tierLevel = String(t.index);
  s.setProperty('--accent-soft', hexA(t.accent, 0.22));
  s.setProperty('--accent', t.accent);
  s.setProperty('--accent-2', t.accent2);
  s.setProperty('--accent-dim', hexA(t.accent, 0.14));
  s.setProperty('--accent-glow', hexA(t.accent, 0.35));
  s.setProperty('--chart-line', t.line);
  s.setProperty('--chart-soft', hexA(t.line, 0.5));
  s.setProperty('--chart-glow', hexA(t.line, 0.35));
  s.setProperty('--chart-bg', hexA(t.line, 0.14));
}
export function clearTier() {
  if (typeof document === 'undefined') return;
  const s = document.documentElement.style;
  ['--chart-line', '--chart-soft', '--chart-glow', '--chart-bg', '--tier-bg'].forEach((v) => s.removeProperty(v));
  delete document.documentElement.dataset.tier;
  delete document.documentElement.dataset.tierLevel;
  s.removeProperty('--accent-soft');
}
