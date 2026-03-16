import { v4 as uuidv4 } from 'uuid';
import { format, formatDistanceToNow, isPast, isToday, isTomorrow } from 'date-fns';

export const genId = () => uuidv4();

export const CURRENCIES = {
  KES: { symbol: 'KSh', locale: 'en-KE' },
  USD: { symbol: '$', locale: 'en-US' },
  EUR: { symbol: '€', locale: 'de-DE' },
  GBP: { symbol: '£', locale: 'en-GB' },
  UGX: { symbol: 'USh', locale: 'en-UG' },
  TZS: { symbol: 'TSh', locale: 'en-TZ' },
};

export function formatCurrency(amount, currency = 'KES') {
  const cfg = CURRENCIES[currency] || CURRENCIES.KES;
  const num = Number(amount) || 0;
  return `${cfg.symbol} ${num.toLocaleString(cfg.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatShort(amount, currency = 'KES') {
  const cfg = CURRENCIES[currency] || CURRENCIES.KES;
  const n = Number(amount) || 0;
  if (Math.abs(n) >= 1_000_000) return `${cfg.symbol} ${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${cfg.symbol} ${(n / 1_000).toFixed(1)}K`;
  return formatCurrency(n, currency);
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
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function todayISO() {
  return new Date().toISOString().split('T')[0];
}

export function monthRange(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return {
    from: start.toISOString().split('T')[0],
    to: end.toISOString().split('T')[0],
    label: format(start, 'MMMM yyyy'),
  };
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

export const EXPENSE_CATEGORIES = CATEGORIES.filter((c) =>
  !['salary', 'freelance', 'investment'].includes(c.id)
);
export const INCOME_CATEGORIES = CATEGORIES.filter((c) =>
  ['salary', 'freelance', 'investment', 'business', 'other'].includes(c.id)
);

// ─── CHART HELPERS ────────────────────────────────────────────────────────────
export function groupByDay(transactions, days = 7) {
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    const label = format(d, 'EEE');
    const income = transactions.filter((t) => t.date === key && t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const expense = transactions.filter((t) => t.date === key && t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    result.push({ label, date: key, income, expense });
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
