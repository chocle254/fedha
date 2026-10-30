// Section themes: every part of Luxe has its own mood. Each theme drives the moving background (components/Ambience.js:
// three colours + a motion style) and the accent used by buttons, chips, the nav and focus rings (CSS vars on <html>).
// Gold is kept for small touches only (the logo glint, trophies), not whole sections.
// mode: 0 silk · 1 grid (markets / code) · 2 spotlight (cinema) · 3 pulse (music)

export const THEMES = {
  money:    { name: 'Private bank', c1: '#020E0B', c2: '#0A3A2C', c3: '#1E8A66', accent: '#34D399', accent2: '#6EE7B7', mode: 0, speed: 1 },
  trading:  { name: 'Trading floor', c1: '#01070F', c2: '#06283A', c3: '#0FA3A3', accent: '#2DD4BF', accent2: '#5EEAD4', mode: 1, speed: 1.3 },
  chill:    { name: 'Cinema', c1: '#080104', c2: '#3A0612', c3: '#8B1C2C', accent: '#F43F5E', accent2: '#FB7185', mode: 2, speed: 0.8 },
  music:    { name: 'Club', c1: '#06010E', c2: '#2C0A4E', c3: '#B026C8', accent: '#E879F9', accent2: '#F0ABFC', mode: 3, speed: 1.2 },
  startup:  { name: 'Boardroom', c1: '#01050E', c2: '#0A2758', c3: '#2F6FE0', accent: '#60A5FA', accent2: '#93C5FD', mode: 0, speed: 0.9 },
  hackathon:{ name: 'Arena', c1: '#030110', c2: '#1C0B4A', c3: '#0AA7C8', accent: '#22D3EE', accent2: '#A78BFA', mode: 1, speed: 1.4 },
  learning: { name: 'Library', c1: '#03030E', c2: '#1D1A4A', c3: '#5B5FE6', accent: '#818CF8', accent2: '#A5B4FC', mode: 0, speed: 0.8 },
  health:   { name: 'Energy', c1: '#0D0302', c2: '#45120A', c3: '#E2621B', accent: '#FB923C', accent2: '#FDBA74', mode: 3, speed: 1.1 },
  food:     { name: 'Kitchen', c1: '#0B0702', c2: '#3B2806', c3: '#C9770A', accent: '#FBBF24', accent2: '#FCD34D', mode: 0, speed: 0.9 },
  planner:  { name: 'Dawn', c1: '#010910', c2: '#0B3146', c3: '#2AA8E0', accent: '#38BDF8', accent2: '#7DD3FC', mode: 0, speed: 0.9 },
  business: { name: 'Empire', c1: '#06020E', c2: '#28104E', c3: '#9446E8', accent: '#C084FC', accent2: '#D8B4FE', mode: 0, speed: 1 },
};

const ROUTES = [
  ['/trading', 'trading'], ['/binance', 'trading'],
  ['/chill', 'chill'], ['/reels', 'chill'],
  ['/music', 'music'],
  ['/startup', 'startup'],
  ['/hackathon', 'hackathon'], ['/tech-hub', 'hackathon'],
  ['/learning', 'learning'],
  ['/health', 'health'], ['/workout', 'health'],
  ['/meals', 'food'],
  ['/planner', 'planner'], ['/activities', 'planner'],
  ['/discover', 'business'],
];

export function themeKeyFor(pathname = '/') {
  const hit = ROUTES.find(([p]) => pathname === p || pathname.startsWith(p + '/'));
  return hit ? hit[1] : 'money';
}

export const themeFor = (pathname) => THEMES[themeKeyFor(pathname)];

const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

// Puts the theme's accent on <html> so every screen (and inline styles using var(--accent)) follows it.
export function applyTheme(key) {
  if (typeof document === 'undefined') return;
  const t = THEMES[key] || THEMES.money;
  const s = document.documentElement.style;
  s.setProperty('--accent', t.accent);
  s.setProperty('--accent-2', t.accent2);
  s.setProperty('--accent-dim', hexA(t.accent, 0.14));
  s.setProperty('--accent-glow', hexA(t.accent, 0.35));
  s.setProperty('--theme-deep', t.c1);
  s.setProperty('--theme-mid', t.c2);
  s.setProperty('--theme-hi', t.c3);
  document.documentElement.dataset.theme = key;
}
