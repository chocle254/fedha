// Holiday looks for the money screens: on these days the background's motion and glow switch to the holiday
// (the wealth tier's colours stay). Kenyan public holidays plus the big global ones. Easter moves every year,
// so it is worked out from the date (Anonymous Gregorian algorithm).
const KE = ['#000000', '#BB0000', '#006600', '#FFFFFF'];

function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}

// Each holiday: when (month 1-12, day ranges), a greeting, glow colours, and its emitters (see TierMotion).
// The owner's birthday: 5 December 2001.
export const BIRTH = { y: 2001, m: 12, d: 5 };
// GTA VI release as announced by Rockstar (Nov 2025). Change here if it moves.
export const VICE = { release: '2026-11-19', start: '2026-11-01', end: '2026-11-26' };
export const viceRelease = () => new Date(`${VICE.release}T00:00:00`);
export const viceDays = (now = new Date()) => { const t = new Date(now.getFullYear(), now.getMonth(), now.getDate()); return Math.round((viceRelease() - t) / 864e5); };
const ordinal = (n) => { const v = n % 100; return n + (v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'); };

export const HOLIDAYS = [
  { key: 'birthday', name: 'Your birthday', icon: '🎂', when: (m, d) => m === BIRTH.m && d === BIRTH.d,
    greet: (y) => `Happy ${ordinal(y - BIRTH.y)} birthday! 🎉`, glows: ['236,72,153', '251,191,36'],
    emit: [{ emoji: ['🎈'], motion: 'float', n: 9, size: [20, 32] }, { shape: 'confetti', motion: 'fall', n: 18, colors: ['#F472B6', '#FBBF24', '#60A5FA', '#34D399', '#A78BFA', '#FFFFFF'] }, { emoji: ['🎉', '🎁', '🎂'], motion: 'fall', n: 4, size: [16, 24], slow: true }] },
  { key: 'newyear', name: 'New Year', icon: '🎆', when: (m, d) => (m === 12 && d === 31) || (m === 1 && d <= 2),
    greet: (y, m) => `Happy New Year ${m === 12 ? y + 1 : y}!`, glows: ['251,191,36', '236,72,153'],
    emit: [{ shape: 'burst', n: 6, colors: ['#FDE68A', '#F472B6', '#67E8F9', '#FFFFFF', '#A78BFA'] }, { shape: 'confetti', motion: 'fall', n: 16, colors: ['#FBBF24', '#F472B6', '#60A5FA', '#34D399', '#FFFFFF'] }] },
  { key: 'christmas', name: 'Christmas', icon: '🎄', when: (m, d) => m === 12 && d >= 20 && d <= 26,
    greet: () => 'Merry Christmas!', glows: ['220,38,38', '22,163,74'],
    scene: 'christmas',
    emit: [{ shape: 'snow', motion: 'fall', n: 26, size: [3, 6], slow: true }, { shape: 'snow', motion: 'fall', n: 8, size: [8, 13] }] },
  { key: 'jamhuri', name: 'Jamhuri Day', icon: '🇰🇪', when: (m, d) => m === 12 && d === 12,
    greet: () => 'Happy Jamhuri Day!', glows: ['187,0,0', '0,102,0'],
    emit: [{ shape: 'confetti', motion: 'fall', n: 18, colors: KE }, { emoji: ['🇰🇪'], motion: 'float', n: 5, size: [18, 26] }] },
  { key: 'mashujaa', name: 'Mashujaa Day', icon: '🇰🇪', when: (m, d) => m === 10 && d === 20,
    greet: () => 'Happy Mashujaa Day!', glows: ['187,0,0', '0,102,0'],
    emit: [{ shape: 'confetti', motion: 'fall', n: 18, colors: KE }, { emoji: ['🇰🇪'], motion: 'float', n: 5, size: [18, 26] }] },
  { key: 'madaraka', name: 'Madaraka Day', icon: '🇰🇪', when: (m, d) => m === 6 && d === 1,
    greet: () => 'Happy Madaraka Day!', glows: ['187,0,0', '0,102,0'],
    emit: [{ shape: 'confetti', motion: 'fall', n: 18, colors: KE }, { emoji: ['🇰🇪'], motion: 'float', n: 5, size: [18, 26] }] },
  { key: 'valentine', name: "Valentine's Day", icon: '💝', when: (m, d) => m === 2 && (d === 13 || d === 14),
    greet: () => "Happy Valentine's Day!", glows: ['236,72,153', '190,18,60'],
    emit: [{ emoji: ['❤️', '💕', '💖'], motion: 'float', n: 14, size: [14, 26] }, { shape: 'petal', motion: 'fall', n: 8, colors: ['#FBCFE8', '#F9A8D4'] }] },
  { key: 'easter', name: 'Easter', icon: '🐣', when: (m, d, y) => { const e = easter(y), t = new Date(y, m - 1, d); const diff = Math.round((t - e) / 864e5); return diff >= -2 && diff <= 1; },
    greet: () => 'Happy Easter!', glows: ['250,204,21', '167,139,250'],
    emit: [{ emoji: ['🐣', '🌷', '🥚'], motion: 'fall', n: 10, size: [16, 24], slow: true }, { shape: 'confetti', motion: 'fall', n: 10, colors: ['#FDE68A', '#C4B5FD', '#A7F3D0', '#FBCFE8'] }] },
  { key: 'labour', name: 'Labour Day', icon: '🛠️', when: (m, d) => m === 5 && d === 1,
    greet: () => 'Happy Labour Day. Rest, you earned it.', glows: ['239,68,68', '251,191,36'],
    emit: [{ shape: 'confetti', motion: 'fall', n: 14, colors: ['#EF4444', '#FBBF24', '#FFFFFF'] }] },
  { key: 'halloween', name: 'Halloween', icon: '🦇', when: (m, d) => m === 10 && (d === 30 || d === 31),
    greet: () => 'Happy Halloween. Stay out of the cemetery.', glows: ['76,29,149'], scene: 'halloween',
    emit: [{ shape: 'dust', motion: 'fall', n: 14, size: [1.5, 3], colors: ['#9CA3AF', '#6B7280'], slow: true }] },
  // Vice Nights: an original neon-sunset look while we wait for GTA VI (release announced for 19 Nov 2026),
  // until a week after. Real holidays win. Switch off on Home (localStorage 'luxe_vice_off').
  { key: 'vice', name: 'Vice Nights', icon: '🌴', scene: 'vice', glows: ['255,46,136', '34,211,238'],
    when: (m, d, y) => { try { if (localStorage.getItem('luxe_vice_off') === '1') return false; } catch { /* private */ } const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; return iso >= VICE.start && iso <= VICE.end; },
    greet: () => { const n = viceDays(); return n > 0 ? `GTA VI in ${n} day${n === 1 ? '' : 's'}` : n === 0 ? 'GTA VI is out today' : 'Vice Nights'; },
    emit: [{ shape: 'sparkle', n: 8, size: [5, 9], colors: ['#22D3EE', '#FF2E88'] }] },
];

// The app-wide skin for each holiday: accent colours, a display font for headings and the net worth (loaded only on
// that day), Home's greeting, and a decoration that hangs on the net worth card (components/HolidayDecor.js).
// Cards, numbers, buttons and the nav pick it up from html[data-holiday] in styles/globals.css.
const KENYA_SKIN = { accent: '#BB0000', accent2: '#16A34A', decor: 'flag' };
export const SKINS = {
  halloween: { accent: '#A78BFA', accent2: '#4C1D95', font: 'Pirata One', hello: (g) => g.replace(/^Good/, 'Wicked'), decor: 'spider' },
  christmas: { accent: '#EF4444', accent2: '#22C55E', font: 'Mountains of Christmas', hello: (g) => g.replace(/^Good/, 'Merry'), decor: 'ornament' },
  newyear: { accent: '#FBBF24', accent2: '#F472B6', font: 'Monoton', hello: () => 'Happy New Year', decor: 'cheers' },
  birthday: { accent: '#EC4899', accent2: '#FBBF24', font: 'Pacifico', hello: () => "It's your day", decor: 'balloon' },
  valentine: { accent: '#EC4899', accent2: '#F43F5E', font: 'Great Vibes', hello: (g) => g.replace(/^Good/, 'Lovely'), decor: 'heart' },
  easter: { accent: '#A78BFA', accent2: '#FDE68A', hello: () => 'Happy Easter', decor: 'chick' },
  jamhuri: KENYA_SKIN, mashujaa: KENYA_SKIN, madaraka: KENYA_SKIN,
  labour: { accent: '#EF4444', accent2: '#FBBF24' },
  vice: { accent: '#FF2E88', accent2: '#22D3EE', font: 'Monoton', hello: (g) => `${g}, Vice`, decor: 'palm' },
};

export function holidayFor(date = new Date()) {
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  const h = HOLIDAYS.find((x) => x.when(m, d, y));
  if (h) return { ...h, greeting: h.greet(y, m), skin: SKINS[h.key] || {} };
  // A birthday gift: the birthday look kept on for the week after (localStorage 'luxe_bday_glow_until').
  try {
    const until = typeof localStorage !== 'undefined' && localStorage.getItem('luxe_bday_glow_until');
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (until && iso <= until) { const b = HOLIDAYS.find((x) => x.key === 'birthday'); return { ...b, greeting: 'Birthday week ✨', skin: { ...SKINS.birthday, hello: (g) => g } }; }
  } catch { /* private mode */ }
  return null;
}

// Birthday countdown: days until the next 5 December (0 on the day) and the age turned on it.
export function birthdayInfo(date = new Date()) {
  const y = date.getFullYear();
  const today = new Date(y, date.getMonth(), date.getDate());
  let next = new Date(y, BIRTH.m - 1, BIRTH.d);
  if (next < today) next = new Date(y + 1, BIRTH.m - 1, BIRTH.d);
  const days = Math.round((next - today) / 864e5);
  const iso = `${next.getFullYear()}-${String(BIRTH.m).padStart(2, '0')}-${String(BIRTH.d).padStart(2, '0')}`;
  return { days, isToday: days === 0, age: next.getFullYear() - BIRTH.y, year: next.getFullYear(), iso };
}
