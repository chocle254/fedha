// The Luxe mark: a brilliant-cut gem in platinum with a faint prism edge and a sparkle. `animated` adds a slow light
// sweep across the facets (used in the sidebar, login and the welcome intro). Same drawing as public/icon.svg.
export const GEM_FACETS = [
  // crown
  { d: 'M16 42 L33 27 L31 42 Z', f: 'a' },
  { d: 'M33 27 L50 42 L31 42 Z', f: 'b' },
  { d: 'M33 27 L67 27 L50 42 Z', f: 'c' },
  { d: 'M67 27 L69 42 L50 42 Z', f: 'b' },
  { d: 'M67 27 L84 42 L69 42 Z', f: 'd' },
  // pavilion
  { d: 'M16 42 L31 42 L50 86 Z', f: 'e' },
  { d: 'M31 42 L50 42 L50 86 Z', f: 'f' },
  { d: 'M50 42 L69 42 L50 86 Z', f: 'g' },
  { d: 'M69 42 L84 42 L50 86 Z', f: 'h' },
];

const FILL = { a: '#F4F6FA', b: '#C9D1DE', c: '#E6EAF1', d: '#8E99AD', e: '#B9C3D3', f: '#EEF1F6', g: '#7D889C', h: '#5D687D' };

export default function LuxeMark({ size = 36, animated = false, glow = true, style }) {
  const id = `lx${size}${animated ? 'a' : ''}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label="Luxe" role="img" style={style} className={animated ? 'lx-mark-anim' : undefined}>
      <defs>
        <linearGradient id={`${id}p`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7DE3F4" />
          <stop offset="0.5" stopColor="#C4B5FD" />
          <stop offset="1" stopColor="#F9A8D4" />
        </linearGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${id}g`} cx="50%" cy="55%" r="50%">
          <stop offset="0" stopColor="#C4B5FD" stopOpacity="0.35" />
          <stop offset="1" stopColor="#C4B5FD" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}c`}><path d="M16 42 L33 27 L67 27 L84 42 L50 86 Z" /></clipPath>
      </defs>
      {glow && <circle cx="50" cy="54" r="46" fill={`url(#${id}g)`} />}
      {GEM_FACETS.map((x, i) => <path key={i} d={x.d} fill={FILL[x.f]} />)}
      <path d="M16 42 L33 27 L67 27 L84 42 L50 86 Z" fill="none" stroke={`url(#${id}p)`} strokeWidth="1.6" strokeLinejoin="round" opacity="0.9" />
      <path d="M16 42 H84" stroke="#fff" strokeOpacity="0.55" strokeWidth="0.9" />
      {animated && (
        <g clipPath={`url(#${id}c)`}>
          <rect className="lx-mark-sweep" x="-60" y="0" width="40" height="100" fill={`url(#${id}s)`} transform="skewX(-20)" />
        </g>
      )}
      {/* sparkle */}
      <path d="M80 12 L82 19 L89 21 L82 23 L80 30 L78 23 L71 21 L78 19 Z" fill="#fff" className={animated ? 'lx-mark-spark' : undefined} />
    </svg>
  );
}
