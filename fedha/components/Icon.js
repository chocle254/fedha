// Luxe's line icons (Lucide-style, 24px grid, 1.8 stroke) so navigation uses one consistent icon family
// instead of emoji. <Icon name="wallet" size={22} />. Decorative by default (aria-hidden); pass label to announce it.
const P = {
  home: ['M3 10.5 12 3l9 7.5', 'M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5'],
  list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3.5 6h.01', 'M3.5 12h.01', 'M3.5 18h.01'],
  budget: ['M21 12A9 9 0 1 1 12 3v9z', 'M15 3.5A9 9 0 0 1 20.5 9H15z'],
  food: ['M4 3v7a3 3 0 0 0 3 3v8', 'M7 3v6', 'M10 3v7a3 3 0 0 1-3 3', 'M17 21V3c-2.2 0-4 2.5-4 6.5 0 2.5 1.3 4 4 4.5'],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  wallet: ['M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3', 'M21 9h-5a3 3 0 0 0 0 6h5z'],
  target: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z', 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z'],
  chart: ['M3 3v18h18', 'M7 15l4-4 3 3 5-6'],
  calendar: ['M8 2v4', 'M16 2v4', 'M3 9h18', 'M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'],
  film: ['M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z', 'M7 3v18', 'M17 3v18', 'M3 8h4', 'M3 16h4', 'M17 8h4', 'M17 16h4', 'M3 12h18'],
  music: ['M9 18V5l12-2v13', 'M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  heart: ['M19 14c1.5-1.5 3-3.3 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z'],
  trending: ['M22 7l-8.5 8.5-5-5L2 17', 'M16 7h6v6'],
  briefcase: ['M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16', 'M4 6h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z'],
  learn: ['M22 10 12 5 2 10l10 5 10-5z', 'M6 12v5c3 2 9 2 12 0v-5'],
  code: ['M16 18l6-6-6-6', 'M8 6l-6 6 6 6'],
  zap: ['M13 2 3 14h9l-1 8 10-12h-9z'],
  dumbbell: ['M6.5 6.5l11 11', 'M21 21l-1-1', 'M3 3l1 1', 'M18 22l4-4', 'M2 6l4-4', 'M3 10l7-7', 'M14 21l7-7'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  mic: ['M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z', 'M19 10v2a7 7 0 0 1-14 0v-2', 'M12 19v3'],
  play: ['M6 3l14 9-14 9z'],
  plus: ['M12 5v14', 'M5 12h14'],
  activity: ['M22 12h-4l-3 9L9 3l-3 9H2'],
  bolt: ['M13 2 3 14h9l-1 8 10-12h-9z'],
  reels: ['M2 7h20', 'M7 2l3 5', 'M14 2l3 5', 'M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z', 'M10 12v5l4-2.5z'],
};

export default function Icon({ name, size = 22, stroke = 1.8, label, style, filled = false }) {
  const paths = P[name] || P.more;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === 'more' ? 3 : stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden={label ? undefined : true} aria-label={label} role={label ? 'img' : undefined} style={style}>
      {paths.map((d, i) => <path key={i} d={d} fill={filled && i === 0 ? 'currentColor' : 'none'} fillOpacity={filled ? 0.18 : 0} />)}
    </svg>
  );
}
