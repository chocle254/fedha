import { useEffect, useMemo, useState } from 'react';
import { formatShort, getCategoryById, monthRange } from '../lib/utils';

// Home → Money pulse: the month at a glance, read from your own transactions.
//  • Savings rate this month (kept ÷ earned) as a ring.
//  • Six months of money in vs money out as paired bars (this month highlighted).
//  • Where the money went this month: the top categories as bars.
//  • Pace: spending per day so far and where the month ends at that pace.
// Bars grow in on first view. Transfers between your own wallets are left out.

const sum = (list) => list.reduce((s, t) => s + (Number(t.amount) || 0), 0);

export default function MoneyPulse({ transactions = [], currency }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => { const t = setTimeout(() => setGrown(true), 120); return () => clearTimeout(t); }, []);

  const data = useMemo(() => {
    const months = [];
    for (let i = -5; i <= 0; i++) {
      const r = monthRange(i);
      const inMonth = transactions.filter((t) => t.date >= r.from && t.date <= r.to);
      months.push({ label: r.label.slice(0, 3), income: sum(inMonth.filter((t) => t.type === 'income')), expense: sum(inMonth.filter((t) => t.type === 'expense')), now: i === 0 });
    }
    const cur = monthRange(0);
    const mt = transactions.filter((t) => t.date >= cur.from && t.date <= cur.to && t.type === 'expense');
    const byCat = {};
    for (const t of mt) byCat[t.category] = (byCat[t.category] || 0) + (Number(t.amount) || 0);
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id, v]) => ({ ...getCategoryById(id), v }));
    const today = new Date();
    const day = today.getDate();
    const daysIn = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const m = months[months.length - 1];
    const perDay = m.expense / Math.max(1, day);
    return { months, cats, perDay, projected: perDay * daysIn, rate: m.income > 0 ? Math.max(-100, Math.min(100, ((m.income - m.expense) / m.income) * 100)) : null, m, lastExpense: months[months.length - 2].expense };
  }, [transactions]);

  const max = Math.max(1, ...data.months.flatMap((x) => [x.income, x.expense]));
  const catMax = Math.max(1, ...data.cats.map((c) => c.v));
  const R = 30; const C = 2 * Math.PI * R;
  const rate = data.rate;
  const rateColor = rate == null ? 'var(--text-3)' : rate >= 20 ? 'var(--green)' : rate >= 0 ? 'var(--yellow)' : 'var(--red)';
  const vsLast = data.lastExpense > 0 ? ((data.projected - data.lastExpense) / data.lastExpense) * 100 : null;

  return (
    <div className="card lx-pulse" style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <svg width="76" height="76" viewBox="0 0 76 76" role="img" aria-label={`Savings rate ${rate == null ? 'not known' : Math.round(rate) + '%'}`} style={{ flexShrink: 0 }}>
          <circle cx="38" cy="38" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="7" />
          <circle cx="38" cy="38" r={R} fill="none" stroke={rateColor} strokeWidth="7" strokeLinecap="round" transform="rotate(-90 38 38)"
            strokeDasharray={`${grown && rate > 0 ? (rate / 100) * C : 0} ${C}`} style={{ transition: 'stroke-dasharray 1.4s var(--ease-out)', filter: `drop-shadow(0 0 6px ${rateColor})` }} />
          <text x="38" y="42" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--text)" style={{ fontFamily: 'Onest, sans-serif' }}>{rate == null ? '—' : `${Math.round(rate)}%`}</text>
        </svg>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.35, letterSpacing: '-0.01em' }}>
            {rate == null ? 'No income recorded this month yet.' : rate >= 0 ? `You kept ${Math.round(rate)}% of what came in this month.` : `You spent ${Math.round(-rate)}% more than came in this month.`}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
            {formatShort(data.m.income, currency)} in · {formatShort(data.m.expense, currency)} out
          </div>
        </div>
      </div>

      {/* Six months */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 96, marginTop: 18 }}>
        {data.months.map((x, i) => (
          <div key={x.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%' }}>
            <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 3 }}>
              {[['income', 'var(--green)'], ['expense', 'var(--red)']].map(([k, col]) => (
                <div key={k} title={`${x.label} ${k}: ${formatShort(x[k], currency)}`} style={{
                  width: '38%', borderRadius: 5, background: `linear-gradient(180deg, ${col}, transparent 140%)`,
                  opacity: x.now ? 1 : 0.5, height: `${Math.max(2, (x[k] / max) * 100)}%`,
                  transform: grown ? 'scaleY(1)' : 'scaleY(0.02)', transformOrigin: 'bottom',
                  transition: `transform .9s var(--ease-out) ${i * 50}ms`, boxShadow: x.now ? `0 0 14px -4px ${col}` : 'none',
                }} />
              ))}
            </div>
            <div style={{ fontSize: 10.5, color: x.now ? 'var(--text)' : 'var(--text-3)', fontWeight: x.now ? 700 : 500 }}>{x.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--green)', marginRight: 5 }} />In</span>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--red)', marginRight: 5 }} />Out</span>
      </div>

      {/* Where it went */}
      {data.cats.length > 0 && (
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <div className="section-title" style={{ marginBottom: 10 }}>Where it went</div>
          {data.cats.map((c, i) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
              <span style={{ width: 22, textAlign: 'center' }}>{c.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-2)' }}>{c.label}</span>
                  <span className="font-num" style={{ fontWeight: 600 }}>{formatShort(c.v, currency)}</span>
                </div>
                <div style={{ height: 5, borderRadius: 5, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 5, background: c.color, width: `${(c.v / catMax) * 100}%`, transform: grown ? 'scaleX(1)' : 'scaleX(0)', transformOrigin: 'left', transition: `transform .9s var(--ease-out) ${150 + i * 60}ms` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pace */}
      {data.m.expense > 0 && (
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <div className="card-2" style={{ flex: 1, padding: '10px 12px' }}>
            <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase' }}>Per day</div>
            <div className="font-num" style={{ fontSize: 16, fontWeight: 700, marginTop: 3 }}>{formatShort(data.perDay, currency)}</div>
          </div>
          <div className="card-2" style={{ flex: 1, padding: '10px 12px' }}>
            <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase' }}>Month ends at</div>
            <div className="font-num" style={{ fontSize: 16, fontWeight: 700, marginTop: 3 }}>{formatShort(data.projected, currency)}</div>
            {vsLast != null && <div style={{ fontSize: 11, marginTop: 2, color: vsLast > 5 ? 'var(--red)' : vsLast < -5 ? 'var(--green)' : 'var(--text-3)' }}>{vsLast > 0 ? '▲' : '▼'} {Math.abs(Math.round(vsLast))}% vs last month</div>}
          </div>
        </div>
      )}
    </div>
  );
}
