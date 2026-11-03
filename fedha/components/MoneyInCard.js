import { useEffect, useMemo, useState } from 'react';
import { summarize, kes } from '../lib/earnings';
import { formatDistanceToNow, format } from 'date-fns';

// Dashboard "Money in": today, this week (vs last week), this month, the streak of days with money coming in,
// a bar chart (daily / monthly / yearly toggle) and the latest payments. Fires confetti when money has arrived since you last opened Luxe.
// Loans, Fuliza, reversals and moves between your own wallets don't count (lib/earnings.js).
const SEEN = 'luxe_money_seen';

const tickFor = (view, d) => {
  const dt = new Date(`${d.day}T12:00:00`);
  return view === 'daily' ? format(dt, 'EEEEE') : view === 'weekly' ? format(dt, 'd/M') : view === 'monthly' ? format(dt, 'MMMMM') : format(dt, 'yyyy');
};
const labelFor = (view, d, i, last) => {
  const dt = new Date(`${d.day}T12:00:00`);
  if (view === 'daily') return i === last ? 'Today' : i === last - 1 ? 'Yesterday' : format(dt, 'EEE d MMM');
  if (view === 'weekly') return i === last ? `This week · from ${format(dt, 'EEE d MMM')}` : i === last - 1 ? `Last week · from ${format(dt, 'd MMM')}` : `Week of ${format(dt, 'd MMM yyyy')}`;
  if (view === 'monthly') return i === last ? `This month · ${format(dt, 'MMM yyyy')}` : format(dt, 'MMMM yyyy');
  return i === last ? `This year · ${format(dt, 'yyyy')}` : format(dt, 'yyyy');
};

export default function MoneyInCard({ transactions }) {
  const s = useMemo(() => summarize(transactions || []), [transactions]);
  const [fresh, setFresh] = useState(0);
  const [view, setView] = useState('daily'); // daily | weekly | monthly | yearly
  const [selByView, setSelByView] = useState({ daily: 13, weekly: 11, monthly: 11, yearly: 4 }); // bar being read (latest by default)
  const bars = view === 'daily' ? s.days14 : view === 'weekly' ? s.weeks12 : view === 'monthly' ? s.months12 : s.years5;
  const last = bars.length - 1;
  const sel = Math.min(selByView[view], last);
  const setSel = (i) => setSelByView((p) => ({ ...p, [view]: i }));

  useEffect(() => {
    const newest = s.recent[0]?.at || 0;
    let seen = 0;
    try { seen = Number(localStorage.getItem(SEEN)) || 0; } catch { /* private mode */ }
    if (newest > seen) {
      const since = s.recent.filter((t) => t.at > seen).reduce((a, t) => a + t.amount, 0);
      if (seen && since > 0) {
        setFresh(since);
        import('../lib/confetti').then((m) => m.fireConfetti({ count: since >= 1000 ? 160 : 90 })).catch(() => {});
      }
      try { localStorage.setItem(SEEN, String(newest)); } catch { /* ignore */ }
    }
  }, [s.recent]);

  const max = Math.max(1, ...bars.map((d) => d.amount));
  const vs = s.lastWeek > 0 ? Math.round(((s.week - s.lastWeek) / s.lastWeek) * 100) : null;
  if (!s.month && !s.recent.length) return null;

  return (
    <div className="card" style={{ padding: 16, background: 'linear-gradient(135deg, var(--chart-bg, rgba(16,185,129,0.14)), rgba(16,185,129,0.02))', border: '1px solid var(--chart-glow, rgba(16,185,129,0.25))' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: 'var(--green)' }}>💸 MONEY IN</div>
        <span style={{ flex: 1 }} />
        {s.streak >= 2 && <span style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B' }}>🔥 {s.streak}-day streak</span>}
      </div>
      {fresh > 0 && <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>+{kes(fresh)} since you last looked 🎉</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 10 }}>
        {[['Today', s.today, s.isBestDay ? '🥇 best day yet' : null], ['This week', s.week, vs == null ? null : `${vs >= 0 ? '▲' : '▼'} ${Math.abs(vs)}% vs last`], ['This month', s.month, null]].map(([l, v, sub]) => (
          <div key={l}>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{l}</div>
            <div className="font-num" style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{kes(v)}</div>
            {sub && <div style={{ fontSize: 10.5, marginTop: 1, color: sub.startsWith('▼') ? 'var(--red, #EF4444)' : 'var(--green)' }}>{sub}</div>}
          </div>
        ))}
      </div>
      {/* Bar chart: daily (14 days), monthly (12 months) or yearly (5 years). Tap a bar to read it. */}
      <div role="tablist" aria-label="Chart period" style={{ display: 'flex', gap: 4, marginTop: 14, padding: 3, borderRadius: 10, background: 'rgba(255,246,232,0.08)' }}>
        {[['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)}
            style={{ flex: 1, padding: '5px 0', border: 0, borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: view === k ? 'var(--chart-line, var(--green))' : 'transparent', color: view === k ? '#04120C' : 'var(--text-2)' }}>{l}</button>
        ))}
      </div>
      {(() => { const d = bars[sel]; return d && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 12, fontSize: 12.5 }}>
          <span style={{ color: 'var(--text-2)' }}>{labelFor(view, d, sel, last)}</span>
          <b className="font-num" style={{ color: d.amount ? 'var(--green)' : 'var(--text-3)' }}>{d.amount ? `+${kes(d.amount)}` : 'Nothing came in'}</b>
        </div>
      ); })()}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: view === 'yearly' ? 8 : 3, height: 56, marginTop: 6 }} role="group" aria-label={`Money in, ${view}`}>
        {bars.map((d, i) => (
          <button key={d.day} type="button" onClick={() => setSel(i)} aria-label={`${d.day}: ${kes(d.amount)}`} aria-pressed={sel === i}
            style={{ flex: 1, height: '100%', padding: 0, border: 0, background: 'transparent', display: 'flex', alignItems: 'flex-end', cursor: 'pointer' }}>
            <span style={{ width: '100%', height: `${Math.max(5, (d.amount / max) * 100)}%`, borderRadius: 4,
              background: d.amount ? (sel === i ? 'var(--chart-line, var(--green))' : 'var(--chart-soft, rgba(52,211,153,0.5))') : 'rgba(255,246,232,0.12)',
              boxShadow: sel === i ? '0 0 0 2px var(--chart-glow, rgba(52,211,153,0.35))' : 'none' }} />
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: view === 'yearly' ? 8 : 3, marginTop: 4 }} aria-hidden="true">
        {bars.map((d, i) => (
          <span key={d.day} className="font-num" style={{ flex: 1, textAlign: 'center', fontSize: view === 'weekly' ? 8.5 : 10, color: sel === i ? 'var(--text)' : 'var(--text-3)', fontWeight: sel === i || i === last ? 700 : 400 }}>
            {tickFor(view, d)}
          </span>
        ))}
      </div>
      {s.recent.length > 0 && (
        <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
          {s.recent.slice(0, 3).map((t) => (
            <div key={t.id} style={{ display: 'flex', gap: 8, fontSize: 12.5 }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-2)' }}>{t.description || 'Income'}</span>
              <span style={{ color: 'var(--text-3)', fontSize: 11.5 }}>{t.when ? formatDistanceToNow(t.when, { addSuffix: true }) : format(new Date(`${t.date}T12:00:00`), 'EEE d MMM')}</span>
              <b className="font-num" style={{ color: 'var(--green)' }}>+{kes(t.amount)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
