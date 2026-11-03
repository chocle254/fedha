import { motion } from 'framer-motion';

// Designed medals and the streak flame (no emoji). Each medal's shape says what it is for (round with a ribbon for
// focus, a flame shield for streaks, a hexagon for flashcards, a cut gem for mastered cards, a star for quizzes, a
// shield for projects, a laurel wreath for courses), its metal says how hard it was (bronze, silver, gold, platinum,
// diamond), and a drawn icon sits in the middle. Locked medals are dark steel with a lock and a ring that fills
// as you get closer.
export const ART = {
  first_focus: { shape: 'round', metal: 'bronze', glyph: 'timer', of: (s) => [s.counts.focus, 1] },
  focus_10: { shape: 'round', metal: 'silver', glyph: 'timer', of: (s) => [s.counts.focus, 10] },
  focus_50: { shape: 'round', metal: 'gold', glyph: 'bolt', of: (s) => [s.counts.focus, 50] },
  hours_10: { shape: 'round', metal: 'silver', glyph: 'hourglass', of: (s) => [Math.floor(s.counts.focus_min / 60), 10] },
  hours_50: { shape: 'round', metal: 'platinum', glyph: 'hourglass', of: (s) => [Math.floor(s.counts.focus_min / 60), 50] },
  streak_3: { shape: 'flame', metal: 'bronze', glyph: 'flame', of: (s) => [s.best_streak, 3] },
  streak_7: { shape: 'flame', metal: 'gold', glyph: 'flame', of: (s) => [s.best_streak, 7] },
  streak_30: { shape: 'flame', metal: 'diamond', glyph: 'flame', of: (s) => [s.best_streak, 30] },
  reviews_100: { shape: 'hex', metal: 'silver', glyph: 'cards', of: (s) => [s.counts.reviews, 100] },
  reviews_1000: { shape: 'hex', metal: 'gold', glyph: 'brain', of: (s) => [s.counts.reviews, 1000] },
  mastered_25: { shape: 'gem', metal: 'gold', glyph: 'gem', of: (s, x) => [x.mastered, 25] },
  mastered_100: { shape: 'gem', metal: 'diamond', glyph: 'gem', of: (s, x) => [x.mastered, 100] },
  quiz_first: { shape: 'star', metal: 'bronze', glyph: 'target', of: (s) => [s.counts.quizzes, 1] },
  quiz_perfect: { shape: 'star', metal: 'gold', glyph: 'target', of: (s) => [s.counts.perfect, 1] },
  quiz_perfect_10: { shape: 'star', metal: 'platinum', glyph: 'arrow', of: (s) => [s.counts.perfect, 10] },
  project_first: { shape: 'shield', metal: 'silver', glyph: 'hammer', of: (s) => [s.counts.projects_done, 1] },
  project_5: { shape: 'shield', metal: 'gold', glyph: 'rocket', of: (s) => [s.counts.projects_done, 5] },
  course_first: { shape: 'laurel', metal: 'gold', glyph: 'cap', of: (s, x) => [x.coursesDone, 1] },
  course_5: { shape: 'laurel', metal: 'platinum', glyph: 'scroll', of: (s, x) => [x.coursesDone, 5] },
  master_course: { shape: 'laurel', metal: 'diamond', glyph: 'crown', of: (s, x) => [x.bestMastery, 85] },
  level_10: { shape: 'star', metal: 'platinum', glyph: 'star', of: (s, x) => [x.level, 10] },
};
const METAL = {
  bronze: ['#F6C9A0', '#C97C43', '#7A3F16', '#B5651D'],
  silver: ['#FFFFFF', '#C9D1DC', '#7C8796', '#A9B4C2'],
  gold: ['#FFF4C2', '#F5C451', '#A8740B', '#E0A82E'],
  platinum: ['#F4FBFF', '#B9E3F0', '#5E8FA3', '#9FD3E6'],
  diamond: ['#FFFFFF', '#C4B5FD', '#6D28D9', '#7DD3FC'],
  locked: ['#4B5563', '#2B3038', '#15181D', '#3A3F47'],
};
const RIBBON = { bronze: ['#B45309', '#7C2D12'], silver: ['#2563EB', '#1E3A8A'], gold: ['#DC2626', '#7F1D1D'], platinum: ['#0EA5E9', '#075985'], diamond: ['#8B5CF6', '#4C1D95'], locked: ['#374151', '#1F2937'] };

const SHAPES = {
  round: <circle cx="50" cy="52" r="34" />,
  hex: <path d="M50 16 L81 34 L81 70 L50 88 L19 70 L19 34 Z" />,
  gem: <path d="M28 30 L72 30 L86 46 L50 90 L14 46 Z" />,
  star: <path d="M50 14 L60 38 L86 40 L66 57 L72 83 L50 69 L28 83 L34 57 L14 40 L40 38 Z" />,
  shield: <path d="M50 16 L82 26 L80 56 C78 72 66 82 50 90 C34 82 22 72 20 56 L18 26 Z" />,
  flame: <path d="M50 12 C58 28 76 36 76 58 C76 76 64 88 50 88 C36 88 24 76 24 58 C24 46 32 40 36 30 C40 40 44 42 46 42 C46 32 46 22 50 12 Z" />,
  laurel: <circle cx="50" cy="52" r="28" />,
};
// Simple line icons on a 24-unit grid (drawn in the medal's centre).
const GLYPHS = {
  timer: <><circle cx="12" cy="13" r="7" /><path d="M12 13 L12 9 M10 3 L14 3 M12 3 L12 6" /></>,
  bolt: <path d="M13 2 L5 13 L11 13 L10 22 L19 10 L13 10 Z" />,
  hourglass: <path d="M6 3 L18 3 M6 21 L18 21 M7 3 C7 9 17 11 17 21 M17 3 C17 9 7 11 7 21" />,
  flame: <path d="M12 3 C14 8 18 10 18 15 C18 19 15 21 12 21 C9 21 6 19 6 15 C6 12 8 11 9 8 C10 11 11 11 12 11 C12 8 11 6 12 3 Z" />,
  cards: <><rect x="4" y="6" width="12" height="15" rx="2" /><path d="M8 3 L19 3 C20 3 20 4 20 5 L20 17" /></>,
  brain: <path d="M9 4 C6 4 5 7 6 8 C4 9 4 12 6 13 C5 15 6 18 9 18 L9 20 M15 4 C18 4 19 7 18 8 C20 9 20 12 18 13 C19 15 18 18 15 18 L15 20 M9 4 C10 3 11 3 12 5 C13 3 14 3 15 4 M12 5 L12 18" />,
  gem: <path d="M7 4 L17 4 L21 9 L12 21 L3 9 Z M3 9 L21 9 M9 4 L12 9 L15 4 M12 9 L12 21" />,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" /></>,
  arrow: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 12 L21 3 M17 3 L21 3 L21 7" /></>,
  hammer: <path d="M14 4 L20 10 L17 13 L11 7 Z M12 8 L4 16 C3 17 3 19 5 20 C6 21 7 20 8 19 L16 11" />,
  rocket: <path d="M12 2 C16 5 17 10 15 15 L9 15 C7 10 8 5 12 2 Z M9 15 L7 19 L10 18 M15 15 L17 19 L14 18 M12 8 L12 8.5" />,
  cap: <path d="M2 9 L12 4 L22 9 L12 14 Z M6 11 L6 16 C9 19 15 19 18 16 L18 11 M22 9 L22 15" />,
  scroll: <path d="M7 3 L17 3 C19 3 19 6 17 6 L17 19 C17 21 15 21 15 21 L5 21 C3 21 3 18 5 18 L7 18 Z M10 8 L14 8 M10 12 L14 12" />,
  crown: <path d="M3 8 L7 12 L12 5 L17 12 L21 8 L19 18 L5 18 Z M5 21 L19 21" />,
  star: <path d="M12 3 L14.6 9 L21 9.3 L16 13.4 L17.7 20 L12 16.4 L6.3 20 L8 13.4 L3 9.3 L9.4 9 Z" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11 L8 7 C8 3 16 3 16 7 L16 11" /></>,
};

export function Medal({ id, earned, size = 72, progress = 0 }) {
  const art = ART[id] || ART.first_focus;
  const metal = earned ? art.metal : 'locked';
  const [hi, mid, lo, edge] = METAL[metal];
  const [r1, r2] = RIBBON[metal];
  const g = `md-${id}-${earned ? 1 : 0}`;
  const ring = 2 * Math.PI * 44;
  return (
    <svg width={size} height={size * 1.12} viewBox="0 0 100 112" role="img" aria-label={earned ? 'Earned medal' : 'Locked medal'}>
      <defs>
        <linearGradient id={`${g}m`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={hi} /><stop offset=".45" stopColor={mid} /><stop offset="1" stopColor={lo} /></linearGradient>
        <radialGradient id={`${g}s`} cx="35%" cy="28%" r="60%"><stop offset="0" stopColor="#fff" stopOpacity={earned ? 0.75 : 0.15} /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
        <clipPath id={`${g}c`}>{SHAPES[art.shape]}</clipPath>
      </defs>
      {/* ribbon tails (round and laurel medals) */}
      {(art.shape === 'round' || art.shape === 'laurel') && <g><path d="M36 76 L28 106 L40 99 L46 108 L50 82 Z" fill={r1} /><path d="M64 76 L72 106 L60 99 L54 108 L50 82 Z" fill={r2} /></g>}
      {/* laurel leaves */}
      {art.shape === 'laurel' && <g fill={earned ? '#16A34A' : '#374151'}>{Array.from({ length: 7 }, (_, i) => { const a = (-200 + i * 22) * (Math.PI / 180); const b = (20 - i * 22) * (Math.PI / 180); return <g key={i}><ellipse cx={50 + Math.cos(a) * 38} cy={52 + Math.sin(a) * 38} rx="7" ry="3.4" transform={`rotate(${-200 + i * 22 + 90} ${50 + Math.cos(a) * 38} ${52 + Math.sin(a) * 38})`} /><ellipse cx={50 + Math.cos(b) * 38} cy={52 + Math.sin(b) * 38} rx="7" ry="3.4" transform={`rotate(${20 - i * 22 + 90} ${50 + Math.cos(b) * 38} ${52 + Math.sin(b) * 38})`} /></g>; })}</g>}
      {/* the medal body with an inner rim */}
      <g fill={`url(#${g}m)`} stroke={edge} strokeWidth="2.5">{SHAPES[art.shape]}</g>
      <g clipPath={`url(#${g}c)`}>
        <rect x="0" y="0" width="100" height="112" fill={`url(#${g}s)`} />
        {earned && <motion.rect x="-60" y="-10" width="30" height="130" fill="#fff" opacity=".35" transform="rotate(20 50 50)" initial={{ x: -60 }} animate={{ x: 160 }} transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 4, ease: 'easeInOut' }} />}
      </g>
      {art.shape === 'gem' && earned && <path d="M28 30 L40 46 L50 30 L60 46 L72 30 M14 46 L86 46 M40 46 L50 90 L60 46" fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth="1.2" />}
      {/* icon */}
      <g transform="translate(32 34) scale(1.5)" fill="none" stroke={earned ? lo : '#6B7280'} strokeWidth={earned ? 1.9 : 1.6} strokeLinecap="round" strokeLinejoin="round">{earned ? GLYPHS[art.glyph] : GLYPHS.lock}</g>
      {/* how close a locked medal is */}
      {!earned && progress > 0 && <circle cx="50" cy="52" r="44" fill="none" stroke="#34D399" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${ring * Math.min(1, progress)} ${ring}`} transform="rotate(-90 50 52)" opacity=".85" />}
    </svg>
  );
}

// The streak flame: grows and changes colour as the streak climbs (orange, deep orange from 3 days, blue from 7,
// violet-white from 30) and flickers. Grey when you haven't studied today yet.
export function StreakFlame({ days = 0, lit = true, size = 34 }) {
  const c = !lit || days === 0 ? ['#6B7280', '#374151', '#1F2937'] : days >= 30 ? ['#F5F3FF', '#C4B5FD', '#7C3AED'] : days >= 7 ? ['#E0F2FE', '#38BDF8', '#1D4ED8'] : days >= 3 ? ['#FEF3C7', '#FB923C', '#C2410C'] : ['#FEF3C7', '#FBBF24', '#EA580C'];
  const s = size * (1 + Math.min(days, 30) / 60);
  const id = `fl${days >= 30 ? 'v' : days >= 7 ? 'b' : days >= 3 ? 'o' : 'y'}${lit ? 1 : 0}`;
  return (
    <svg width={s} height={s * 1.2} viewBox="0 0 40 48" aria-hidden="true" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor={c[2]} /><stop offset=".55" stopColor={c[1]} /><stop offset="1" stopColor={c[0]} /></linearGradient>
      </defs>
      {lit && days > 0 && <ellipse cx="20" cy="40" rx="13" ry="4" fill={c[1]} opacity=".35" />}
      <motion.path d="M20 2 C24 12 34 16 34 28 C34 38 28 44 20 44 C12 44 6 38 6 28 C6 21 11 18 13 12 C15 18 17 19 18 19 C18 13 18 8 20 2 Z" fill={`url(#${id})`}
        animate={lit && days > 0 ? { scaleY: [1, 1.05, 0.98, 1.03, 1], skewX: [0, 2, -1.5, 1, 0] } : {}} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }} style={{ originX: 0.5, originY: 1 }} />
      <motion.path d="M20 20 C22 26 27 28 27 33 C27 38 24 41 20 41 C16 41 13 38 13 33 C13 30 15 28 16 25 C17 28 18 28 19 28 C19 25 19 23 20 20 Z" fill={c[0]} opacity={lit && days > 0 ? 0.9 : 0.4}
        animate={lit && days > 0 ? { scale: [1, 1.08, 0.96, 1] } : {}} transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }} style={{ originX: 0.5, originY: 1 }} />
    </svg>
  );
}
