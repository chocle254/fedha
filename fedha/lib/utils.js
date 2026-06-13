
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
