
import { v4 as uuidv4 } from 'uuid';
import { format, formatDistanceToNow, isPast, isToday, isTomorrow } from 'date-fns';

export const genId = () => uuidv4();

export const CURRENCIES = {
  KES: { symbol: 'KSh', locale: 'en-KE' },
  USD: { symbol: '$',   locale: 'en-US' },
  EUR: { symbol: '€',   locale: 'de-DE' },
  GBP: { symbol: '£',   locale: 'en-GB' },
  UGX: { symbol: 'USh', locale: 'en-UG' },
  TZS: { symbol: 'TSh', locale: 'en-TZ' },
};

// ─── EXCHANGE RATES ───────────────────────────────────────────────────────────
// ALL money is STORED in the base currency (KES). Display currency is converted
// at render time. _rates[X] = "1 base unit = X units of currency X".
let _baseCurrency = 'KES';
let _rates = { KES: 1, USD: 0.0077, EUR: 0.0071, GBP: 0.0061, UGX: 28.5, TZS: 19.5 }; // offline fallback

export function setRates(rates, base = 'KES') {
  if (rates && typeof rates === 'object') _rates = { ..._rates, ...rates };
  if (base) _baseCurrency = base;
}
export function getRates() { return { ..._rates }; }
export function getBaseCurrency() { return _baseCurrency; }

// base amount -> display currency
export function convertAmount(amount, displayCurrency = _baseCurrency) {
  const a = Number(amount) || 0;
  const rate = _rates[displayCurrency];
  return rate ? a * rate : a;
}
// display-currency amount -> base (use this when SAVING user-entered amounts)
export function toBaseAmount(amount, displayCurrency = _baseCurrency) {
  const a = Number(amount) || 0;
  const rate = _rates[displayCurrency];
  return rate ? a / rate : a;
}

export function formatCurrency(amount, currency = _baseCurrency) {
  const cfg = CURRENCIES[currency] || CURRENCIES.KES;
  const num = convertAmount(amount, currency);
  return `${cfg.symbol} ${num.toLocaleString(cfg.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatShort(amount, currency = _baseCurrency) {
  const cfg = CURRENCIES[currency] || CURRENCIES.KES;
  const n = convertAmount(amount, currency);
  if (Math.abs(n) >= 1_000_000) return `${cfg.symbol} ${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${cfg.symbol} ${(n / 1_000).toFixed(1)}K`;
  return formatCurrency(amount, currency);
}

// ─── LOCAL DATE HELPERS (fixes UTC "wrong day" bug for KES/UTC+3) ───────────────
function pad(n) { return n < 10 ? `0${n}` : `${n}`; }
export function localISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isToday(d)) return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  return format(d, 'dd MMM yyyy');
}
export function formatDateRelative(dateStr) {
  if (!dateStr) return '';
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
}
export function isOverdue(dateStr) {
  return dateStr && isPast(new Date(dateStr)) && !isToday(new Date(dateStr));
}
export function getDaysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
}
export function todayISO() { return localISO(new Date()); }

// ─── COUNTDOWN ────────────────────────────────────────────────────────────────
// Returns { days, hours, minutes, total, past } until an ISO date/deadline.
export function countdownTo(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  // If only a date (no time) was given, treat deadline as end of that day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) target.setHours(23, 59, 59, 999);
  const diff = target - new Date();
  const past = diff <= 0;
  const abs = Math.abs(diff);
  const days = Math.floor(abs / 86400000);
  const hours = Math.floor((abs % 86400000) / 3600000);
  const minutes = Math.floor((abs % 3600000) / 60000);
  return { days, hours, minutes, total: diff, past };
}
export function formatCountdown(dateStr) {
  const c = countdownTo(dateStr);
  if (!c) return '';
  if (c.past) return 'Ended';
  if (c.days > 0) return `${c.days}d ${c.hours}h left`;
  if (c.hours > 0) return `${c.hours}h ${c.minutes}m left`;
  return `${c.minutes}m left`;
}

// ─── IMAGE RESIZE (to keep IndexedDB light) ─────────────────────────────────────
export function resizeImage(file, maxSize = 800, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file'));
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) { height = Math.round((height * maxSize) / width); width = maxSize; }
        else if (height > maxSize) { width = Math.round((width * maxSize) / height); height = maxSize; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── ONLINE JOB PAYOUT CALCULATOR ──────────────────────────────────────────────
// Lock periods: 1st–15th (paid on 21st) and 16th–end (paid on 7th of next month).
// Threshold per lock period; if not met, the earned amount carries into the next
// period, and the user must beat the threshold there to unlock the full payout.
export function lockPeriodFor(date = new Date()) {
  const d = new Date(date);
  const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
  if (day <= 15) {
    const start = new Date(y, m, 1);
    const end = new Date(y, m, 15);
    const payout = new Date(y, m, 21); // paid on the 21st, same month
    return { half: 1, start, end, payout, label: `${format(start, 'd')}–15 ${format(start, 'MMM')}` };
  }
  const start = new Date(y, m, 16);
  const end = new Date(y, m + 1, 0); // last day of month
  const payout = new Date(y, m + 1, 7); // paid on the 7th, next month
  return { half: 2, start, end, payout, label: `16–${format(end, 'd')} ${format(start, 'MMM')}` };
}

// The lock period immediately before the one containing `date`.
export function prevLockPeriodFor(date = new Date()) {
  const cur = lockPeriodFor(date);
  const dayBefore = new Date(cur.start);
  dayBefore.setDate(dayBefore.getDate() - 1);
  return lockPeriodFor(dayBefore);
}

// entries: [{ date, amount }] amounts in display currency the user entered.
// job: { threshold, multiplier, carryover, perTask, minutesPerTask }
export function computeJobProgress(job = {}, now = new Date()) {
  const threshold = Number(job.threshold) || 20;
  const multiplier = Number(job.multiplier) || 1;
  const perTask = Number(job.perTask) || 0;
  const minutesPerTask = Number(job.minutesPerTask) || 0;
  const target = threshold * multiplier;

  const period = lockPeriodFor(now);
  const startISO = localISO(period.start);
  const endISO = localISO(period.end);

  const entries = Array.isArray(job.entries) ? job.entries : [];
  const periodEntries = entries.filter((e) => e.date >= startISO && e.date <= endISO);
  const earnedThisPeriod = periodEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  // Auto carryover: if the PREVIOUS lock period didn't beat the threshold, its
  // earnings roll into this period and still count toward unlocking a payout.
  const prev = prevLockPeriodFor(now);
  const prevStart = localISO(prev.start), prevEnd = localISO(prev.end);
  const prevEarned = entries.filter((e) => e.date >= prevStart && e.date <= prevEnd).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const carryover = prevEarned > 0 && prevEarned < threshold ? prevEarned : 0;

  const earnedTotal = earnedThisPeriod + carryover; // carryover counts toward unlocking

  const remaining = Math.max(0, target - earnedTotal);
  const toThreshold = Math.max(0, threshold - earnedTotal); // amount still needed to UNLOCK payout
  const metThreshold = earnedTotal >= threshold;       // base threshold beaten → will be paid
  const metTarget = earnedTotal >= target;             // user's chosen (multiplied) goal hit

  // Days left in this lock period (inclusive of today)
  const c = countdownTo(endISO);
  const daysLeft = Math.max(1, (c?.days ?? 0) + 1);

  // Tasks math (only meaningful if perTask provided)
  const tasksRemaining = perTask > 0 ? Math.ceil(remaining / perTask) : null;
  const tasksPerDay = tasksRemaining != null ? Math.ceil(tasksRemaining / daysLeft) : null;
  const minutesPerDay = tasksPerDay != null && minutesPerTask > 0 ? tasksPerDay * minutesPerTask : null;
  const amountPerDay = remaining > 0 ? remaining / daysLeft : 0;

  return {
    target, threshold, multiplier, carryover,
    period, daysLeft,
    earnedThisPeriod, earnedTotal, remaining, toThreshold,
    metThreshold, metTarget,
    perTask, minutesPerTask,
    tasksRemaining, tasksPerDay, minutesPerDay, amountPerDay,
    progressPct: target > 0 ? Math.min(100, (earnedTotal / target) * 100) : 0,
  };
}

// ─── WORK SESSIONS & DAY PLANNING ───────────────────────────────────────────────
export function parseHHMM(s) {
  if (!s || typeof s !== 'string') return 9 * 60;
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
export function fmtClock(totalMin) {
  const m = (((Math.round(totalMin) % 1440) + 1440) % 1440);
  const h = Math.floor(m / 60), mm = m % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm < 10 ? '0' + mm : mm} ${ampm}`;
}
export function fmtDuration(min) {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60), mm = m % 60;
  if (h && mm) return `${h}h ${mm}m`;
  if (h) return `${h}h`;
  return `${mm}m`;
}

// Sum up tracked work time. A session = { date, start (ISO), end (ISO|null) }.
// A session with no end is "active" (currently running).
export function summarizeSessions(sessions = [], now = new Date()) {
  const todayKey = localISO(now);
  let secToday = 0, active = null;
  for (const s of sessions) {
    if (!s?.start) continue;
    const start = new Date(s.start);
    if (!s.end) { active = s; if (s.date === todayKey) secToday += (now - start) / 1000; continue; }
    if (s.date === todayKey) secToday += (new Date(s.end) - start) / 1000;
  }
  return { minutesToday: Math.max(0, Math.round(secToday / 60)), active };
}

// Build a wellness-aware schedule that fits `workMinutes` of tasks around a real
// reboot break after every 60-min block, an afternoon shower, meals and exercise,
// starting at `startTime` ("HH:MM"). Atlas-style heavy-thinking work, so breaks
// are long enough to actually reset your eyes and mood.
export function buildDayPlan(workMinutes, startTime = '09:00') {
  const plan = [];
  let cursor = parseHHMM(startTime);
  const WORK_BLOCK = 60;   // one block = ~2 tasks
  const REBOOT = 20;       // proper reboot between blocks
  let remaining = Math.max(0, Math.round(workMinutes || 0));

  let worked = 0, showered = false, lunched = false, dined = false, moved = false;
  let blocks = 0;
  while (remaining > 0) {
    const block = Math.min(WORK_BLOCK, remaining);
    blocks += 1;
    plan.push({ type: 'work', label: `Work block ${blocks} — ${block} min of tasks`, duration: block, start: cursor });
    cursor += block; remaining -= block; worked += block;
    if (remaining <= 0) break;

    // Afternoon shower (you shower in the afternoon, not the morning)
    if (!showered && cursor >= 14 * 60) { plan.push({ type: 'shower', label: 'Afternoon shower & reset', duration: 30, start: cursor }); cursor += 30; showered = true; continue; }
    // Lunch around midday
    if (!lunched && cursor >= 13 * 60) { plan.push({ type: 'eat', label: 'Lunch — eat properly, step away from the screen', duration: 45, start: cursor }); cursor += 45; lunched = true; continue; }
    // Dinner in the evening
    if (!dined && cursor >= 19 * 60) { plan.push({ type: 'eat', label: 'Dinner break', duration: 45, start: cursor }); cursor += 45; dined = true; continue; }
    // One movement session after a couple hours
    if (!moved && worked >= 120) { plan.push({ type: 'exercise', label: 'Move — walk or quick exercise to reboot', duration: 20, start: cursor }); cursor += 20; moved = true; continue; }
    // Otherwise a proper reboot break — rest eyes, water, breathe
    plan.push({ type: 'break', label: 'Reboot — rest your eyes, water, breathe', duration: REBOOT, start: cursor }); cursor += REBOOT;
  }
  plan.push({ type: 'done', label: 'Goal done — log off & relax', duration: 0, start: cursor });
  return { plan, endsAt: cursor };
}

// Breaks enforced while a session runs, keyed by elapsed active minutes.
// `mins` is how long the enforced break lasts. A reminder also fires 5 min before.
export const SESSION_CHECKPOINTS = [
  { at: 60,  type: 'break',    mins: 20, msg: 'Reboot break — rest your eyes, drink water, breathe.' },
  { at: 140, type: 'eat',      mins: 45, msg: 'Meal break — step away and eat properly.' },
  { at: 225, type: 'exercise', mins: 20, msg: 'Move your body — a short walk or quick exercise.' },
  { at: 305, type: 'break',    mins: 20, msg: 'Another reboot — eyes off the screen, stretch.' },
  { at: 385, type: 'shower',   mins: 30, msg: 'Shower & reset — you have earned it.' },
  { at: 465, type: 'eat',      mins: 45, msg: 'Eat again and recharge.' },
  { at: 545, type: 'break',    mins: 20, msg: 'Reboot break — protect your mood and focus.' },
];

// Rotating motivation shown on the full-screen break overlay.
export const BREAK_MOTIVATION = [
  'Your mind is your tool — sharpen it by resting it.',
  'Rest is part of the work. You earn more clear-headed.',
  'Step away. The tasks will still be there, you will just be faster.',
  'Tired eyes make slow work. Blink, breathe, look far away.',
  'You are not a machine — and that is your advantage.',
  'A calm mind beats a rushed one. Reboot fully.',
  'Every break is an investment in tomorrow’s focus.',
  'Slow down to speed up. You are doing great.',
];

// ─── TIMEZONE CONVERSION (→ Kenya / EAT, UTC+3) ─────────────────────────────────
// Common timezone abbreviations → UTC offset in hours. Kenya (EAT) is +3.
export const TZ_ABBREVIATIONS = [
  { abbr: 'PT',  name: 'US Pacific',        offset: -7 },
  { abbr: 'PST', name: 'US Pacific (std)',  offset: -8 },
  { abbr: 'PDT', name: 'US Pacific (DST)',  offset: -7 },
  { abbr: 'MT',  name: 'US Mountain',       offset: -6 },
  { abbr: 'CT',  name: 'US Central',        offset: -5 },
  { abbr: 'CST', name: 'US Central (std)',  offset: -6 },
  { abbr: 'CDT', name: 'US Central (DST)',  offset: -5 },
  { abbr: 'ET',  name: 'US Eastern',        offset: -4 },
  { abbr: 'EST', name: 'US Eastern (std)',  offset: -5 },
  { abbr: 'EDT', name: 'US Eastern (DST)',  offset: -4 },
  { abbr: 'BRT', name: 'Brazil',            offset: -3 },
  { abbr: 'UTC', name: 'UTC',               offset: 0 },
  { abbr: 'GMT', name: 'GMT (London std)',  offset: 0 },
  { abbr: 'BST', name: 'London (summer)',   offset: 1 },
  { abbr: 'WAT', name: 'West Africa',       offset: 1 },
  { abbr: 'CET', name: 'Central Europe',    offset: 1 },
  { abbr: 'CEST',name: 'Central Europe DST',offset: 2 },
  { abbr: 'EAT', name: 'East Africa (Kenya)', offset: 3 },
  { abbr: 'IST', name: 'India',             offset: 5.5 },
  { abbr: 'GST', name: 'Gulf (Dubai)',      offset: 4 },
  { abbr: 'SGT', name: 'Singapore',         offset: 8 },
  { abbr: 'JST', name: 'Japan',             offset: 9 },
  { abbr: 'AEST',name: 'Australia East',    offset: 10 },
];
const NAIROBI_OFFSET = 3;

export function tzOffsetFor(abbr) {
  const t = TZ_ABBREVIATIONS.find((z) => z.abbr === String(abbr || '').toUpperCase());
  return t ? t.offset : 0;
}

// Convert a wall-clock date+time in a source zone to the true instant (ISO) and a
// Kenya-time (EAT) display label. date='YYYY-MM-DD', time='HH:MM'.
export function toNairobi(date, time, tzAbbr) {
  if (!date || !time) return null;
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const srcOffset = tzOffsetFor(tzAbbr);
  // UTC instant = wall-clock treated as UTC, minus the source offset.
  const utcMs = Date.UTC(y, mo - 1, d, h, mi) - srcOffset * 3600000;
  const iso = new Date(utcMs).toISOString();
  // Kenya wall-clock = UTC + 3, read with UTC getters to ignore device tz.
  const k = new Date(utcMs + NAIROBI_OFFSET * 3600000);
  let hh = k.getUTCHours();
  const mm = k.getUTCMinutes();
  const ampm = hh < 12 ? 'AM' : 'PM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const label = `${k.getUTCDate()} ${months[k.getUTCMonth()]}, ${h12}:${mm < 10 ? '0' + mm : mm} ${ampm} EAT`;
  return { iso, label };
}

export function monthRange(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { from: localISO(start), to: localISO(end), label: format(start, 'MMMM yyyy') };
}

// ─── CATEGORIES ──────────────────────────────────────────────────────────────
export const CATEGORIES = [
  { id: 'food',        label: 'Food & Drink',    icon: '🍽️',  color: '#F59E0B' },
  { id: 'transport',   label: 'Transport',        icon: '🚌',  color: '#3B82F6' },
  { id: 'shopping',    label: 'Shopping',         icon: '🛍️',  color: '#EC4899' },
  { id: 'housing',     label: 'Housing / Rent',   icon: '🏠',  color: '#8B5CF6' },
  { id: 'health',      label: 'Health',           icon: '🏥',  color: '#EF4444' },
  { id: 'education',   label: 'Education',        icon: '📚',  color: '#06B6D4' },
  { id: 'utilities',   label: 'Utilities',        icon: '💡',  color: '#6366F1' },
  { id: 'airtime',     label: 'Airtime / Data',   icon: '📡',  color: '#10B981' },
  { id: 'entertainment', label: 'Entertainment',  icon: '🎬',  color: '#F97316' },
  { id: 'savings',     label: 'Savings',          icon: '🏦',  color: '#14B8A6' },
  { id: 'family',      label: 'Family',           icon: '👨‍👩‍👧',  color: '#A78BFA' },
  { id: 'business',    label: 'Business',         icon: '💼',  color: '#64748B' },
  { id: 'salary',      label: 'Salary',           icon: '💰',  color: '#10B981' },
  { id: 'freelance',   label: 'Freelance',        icon: '🧑‍💻',  color: '#0EA5E9' },
  { id: 'investment',  label: 'Investment',       icon: '📈',  color: '#22C55E' },
  { id: 'other',       label: 'Other',            icon: '📦',  color: '#94A3B8' },
];
export function getCategoryById(id) {
  return CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
}
export const EXPENSE_CATEGORIES = CATEGORIES.filter((c) => !['salary', 'freelance', 'investment'].includes(c.id));
export const INCOME_CATEGORIES = CATEGORIES.filter((c) => ['salary', 'freelance', 'investment', 'business', 'other'].includes(c.id));

// ─── CHART HELPERS ────────────────────────────────────────────────────────────
export function groupByDay(transactions, days = 7) {
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = localISO(d);
    const income = transactions.filter((t) => t.date === key && t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const expense = transactions.filter((t) => t.date === key && t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    result.push({ label: format(d, 'EEE'), date: key, income, expense });
  }
  return result;
}
export function groupByCategory(transactions) {
  const map = {};
  transactions.filter((t) => t.type === 'expense').forEach((t) => {
    const cat = getCategoryById(t.category);
    if (!map[t.category]) map[t.category] = { name: cat.label, value: 0, color: cat.color, icon: cat.icon };
    map[t.category].value += Number(t.amount);
  });
  return Object.values(map).sort((a, b) => b.value - a.value);
}
export function groupByMonth(transactions, months = 6) {
  const result = [];
  for (let i = months - 1; i >= 0; i--) {
    const { from, to, label } = monthRange(-i);
    const income = transactions.filter((t) => t.date >= from && t.date <= to && t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const expense = transactions.filter((t) => t.date >= from && t.date <= to && t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    result.push({ label: label.split(' ')[0], income, expense });
  }
  return result;
}

export function getBalanceChart(transactions, currentBalance, days = 7) {
  const result = [];
  
  // Calculate cumulative balance for each day by summing all transactions up to that day
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = localISO(d);
    
    // Sum all transactions up to and including this day
    const txnsUpToDay = transactions.filter((t) => t.date <= key);
    const totalNetUpToDay = txnsUpToDay.reduce((s, t) => {
      return s + (t.type === 'income' ? Number(t.amount) : -Number(t.amount));
    }, 0);
    
    // Balance on this day = current balance - (all transactions after this day)
    const txnsAfterDay = transactions.filter((t) => t.date > key);
    const totalNetAfterDay = txnsAfterDay.reduce((s, t) => {
      return s + (t.type === 'income' ? Number(t.amount) : -Number(t.amount));
    }, 0);
    
    const balance = currentBalance - totalNetAfterDay;
    result.push({ label: format(d, 'EEE'), date: key, balance });
  }
  return result;
}
