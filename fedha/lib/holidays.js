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
export const HOLIDAYS = [
  { key: 'newyear', name: 'New Year', icon: '🎆', when: (m, d) => (m === 12 && d === 31) || (m === 1 && d <= 2),
    greet: (y, m) => `Happy New Year ${m === 12 ? y + 1 : y}!`, glows: ['251,191,36', '236,72,153'],
    emit: [{ shape: 'burst', n: 6, colors: ['#FDE68A', '#F472B6', '#67E8F9', '#FFFFFF', '#A78BFA'] }, { shape: 'confetti', motion: 'fall', n: 16, colors: ['#FBBF24', '#F472B6', '#60A5FA', '#34D399', '#FFFFFF'] }] },
  { key: 'christmas', name: 'Christmas', icon: '🎄', when: (m, d) => m === 12 && d >= 20 && d <= 26,
    greet: () => 'Merry Christmas!', glows: ['220,38,38', '22,163,74'],
    emit: [{ shape: 'snow', motion: 'fall', n: 26, slow: true }, { emoji: ['❄️'], motion: 'fall', n: 6, size: [14, 22], slow: true }, { shape: 'light', n: 10, colors: ['#EF4444', '#22C55E', '#FBBF24', '#60A5FA'] }] },
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
  { key: 'halloween', name: 'Halloween', icon: '🎃', when: (m, d) => m === 10 && (d === 30 || d === 31),
    greet: () => 'Happy Halloween!', glows: ['249,115,22', '126,34,206'],
    emit: [{ emoji: ['🦇'], motion: 'flutter', n: 7, size: [16, 26] }, { emoji: ['🎃'], motion: 'fall', n: 4, size: [18, 26], slow: true }, { shape: 'ember', motion: 'rise', n: 14, colors: ['#FB923C'] }] },
];

export function holidayFor(date = new Date()) {
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  const h = HOLIDAYS.find((x) => x.when(m, d, y));
  return h ? { ...h, greeting: h.greet(y, m) } : null;
}
