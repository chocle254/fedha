import Link from 'next/link';
import { useApp } from '../context/AppContext';
import { formatShort, formatCurrency, todayISO } from '../lib/utils';

function net(txns, fromKey, toKey) {
  const t = txns.filter((x) => x.date >= fromKey && x.date <= toKey);
  const inc = t.filter((x) => x.type === 'income').reduce((s, x) => s + Number(x.amount), 0);
  const exp = t.filter((x) => x.type === 'expense').reduce((s, x) => s + Number(x.amount), 0);
  return inc - exp;
}

function daysAgoKey(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function noSpendStreak(txns) {
  if (!txns.length) return 0;
  // Only count days since the user started tracking — earlier days aren't real "no-spend" days.
  const earliest = txns.reduce((min, t) => (t.date < min ? t.date : min), txns[0].date);
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const key = daysAgoKey(i);
    if (key < earliest) break;
    const spent = txns.some((t) => t.date === key && t.type === 'expense');
    if (spent) break;
    streak++;
  }
  return streak;
}

function Pill({ label, value, currency }) {
  const positive = value >= 0;
  return (
    <div style={{ flex: '1 1 0', background: 'var(--card-2)', borderRadius: 14, padding: '12px 12px', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div className="font-num" style={{ fontSize: 15, fontWeight: 700, color: positive ? 'var(--green)' : 'var(--red)' }}>
        {positive ? '+' : '−'}{formatShort(Math.abs(value), currency)}
      </div>
    </div>
  );
}

export default function SavingsMotivator() {
  const { transactions, currency, goals } = useApp();

  const today = todayISO();
  const todayNet = net(transactions, today, today);
  const weekNet = net(transactions, daysAgoKey(6), today);
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const yearNet = net(transactions, yearStart, today);
  const streak = noSpendStreak(transactions);

  // Savings rate for the last 30 days
  const monthIncome = transactions.filter((t) => t.date >= daysAgoKey(29) && t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const monthExpense = transactions.filter((t) => t.date >= daysAgoKey(29) && t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const rate = monthIncome > 0 ? Math.max(0, Math.round(((monthIncome - monthExpense) / monthIncome) * 100)) : 0;

  let tier;
  if (rate >= 30) tier = { msg: 'Elite saver! You are crushing it 🚀', color: 'var(--green)', emoji: '🐷' };
  else if (rate >= 20) tier = { msg: 'Great pace — keep it rolling!', color: 'var(--green)', emoji: '🐷' };
  else if (rate >= 10) tier = { msg: 'Solid start. Push for 20%!', color: '#F59E0B', emoji: '🐖' };
  else if (rate > 0) tier = { msg: 'Every shilling counts. Stack it up!', color: '#F59E0B', emoji: '🐖' };
  else tier = { msg: 'No savings yet — start small today!', color: 'var(--red)', emoji: '🪙' };

  const activeGoal = goals?.filter((g) => (g.current || 0) < g.target)[0];

  return (
    <div className="section">
      <div className="section-title">Savings Challenge</div>
      <div className="card" style={{ padding: '18px 16px', borderColor: 'rgba(16,185,129,0.2)' }}>
        {/* Hero rate */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 38, lineHeight: 1 }}>{tier.emoji}</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="font-num" style={{ fontSize: 30, fontWeight: 800, color: tier.color }}>{rate}%</span>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>savings rate · 30d</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>{tier.msg}</div>
          </div>
        </div>

        {/* Rate bar with 30% goal marker */}
        <div className="progress-bar" style={{ height: 8, marginBottom: 16, position: 'relative' }}>
          <div className="progress-fill" style={{ width: `${Math.min(100, (rate / 30) * 100)}%`, background: `linear-gradient(90deg, ${tier.color}99, ${tier.color})` }} />
        </div>

        {/* Period pills */}
        <div style={{ display: 'flex', gap: 8, marginBottom: activeGoal ? 16 : 0 }}>
          <Pill label="Today" value={todayNet} currency={currency} />
          <Pill label="This Week" value={weekNet} currency={currency} />
          <Pill label="This Year" value={yearNet} currency={currency} />
        </div>

        {/* No-spend streak */}
        {streak > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '10px 14px', marginTop: 16 }}>
            <span style={{ fontSize: 20 }}>🔥</span>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#F59E0B' }}>
              {streak}-day no-spend streak — don&apos;t break the chain!
            </div>
          </div>
        )}

        {/* Active goal nudge */}
        {activeGoal && (
          <Link href="/goals" style={{ textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, padding: '12px 14px', background: 'var(--card-2)', borderRadius: 12, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 22 }}>{activeGoal.icon || '🎯'}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Saving for {activeGoal.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  {formatShort(activeGoal.current || 0, currency)} of {formatShort(activeGoal.target, currency)} · {formatCurrency(Math.max(0, activeGoal.target - (activeGoal.current || 0)), currency)} to go
                </div>
              </div>
              <span style={{ color: 'var(--green)', fontSize: 18 }}>›</span>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}
