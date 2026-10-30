// Balance over time — one continuous line of your end-of-day total balance
// (all wallets), Ziidi-style. Days, months and the year sit on one timeline;
// the range buttons just choose how far back it goes. Tap/drag the chart to
// read any day, or switch to a table of closing balances.
import { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { formatShort, formatCurrency, localISO, convertAmount } from '../lib/utils';

const RANGES = [
  { id: '1M', label: '1M', days: 30 },
  { id: '3M', label: '3M', days: 91 },
  { id: '6M', label: '6M', days: 182 },
  { id: '1Y', label: '1Y', days: 365 },
  { id: 'ALL', label: 'All', days: null },
];

const LINE = '#34D399';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Money in or out of your total. Transfers between your own wallets don't
// change the total (their fee is recorded as its own expense).
function delta(t) {
  const a = Number(t.amount) || 0;
  if (t.type === 'income') return a;
  if (t.type === 'expense') return -a;
  return 0;
}

// Compact axis numbers in the display currency: 500, 1.5K, 12K, 2M.
function axisNum(v, currency) {
  const n = convertAmount(v, currency);
  const a = Math.abs(n);
  if (a >= 1e6) return `${+(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${+(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`;
  return `${Math.round(n)}`;
}

const parse = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const dayLabel = (iso) => { const d = parse(iso); return `${MONTHS[d.getMonth()]} ${d.getDate()}`; };
const longLabel = (iso) => { const d = parse(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

// End-of-day balance for every day from `startISO` to today, worked
// backwards from today's real balance: balance(D) = now − (net of later days).
function dailyBalances(transactions, currentBalance, startISO) {
  const net = {};
  for (const t of transactions) {
    if (!t?.date) continue;
    const key = String(t.date).slice(0, 10);
    net[key] = (net[key] || 0) + delta(t);
  }
  const out = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  const start = parse(startISO);
  let balance = currentBalance;
  while (cursor >= start) {
    const key = localISO(cursor);
    out.push({ date: key, balance });
    balance -= net[key] || 0; // step back to the previous day's close
    cursor.setDate(cursor.getDate() - 1);
  }
  return out.reverse();
}

function ChartTooltip({ active, payload, currency }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={{ background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', boxShadow: '0 8px 20px rgba(0,0,0,0.4)' }}>
      <div className="font-num" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{formatCurrency(p.balance, currency)}</div>
      <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{longLabel(p.date)}</div>
    </div>
  );
}

export default function BalanceHistoryChart({ transactions, currentBalance, currency }) {
  const [range, setRange] = useState('6M');
  const [asTable, setAsTable] = useState(false);

  const firstDate = useMemo(() => {
    let min = null;
    for (const t of transactions || []) {
      const d = String(t?.date || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && (!min || d < min)) min = d;
    }
    return min;
  }, [transactions]);

  const data = useMemo(() => {
    const r = RANGES.find((x) => x.id === range);
    let start;
    if (r.days == null) {
      start = firstDate || localISO(new Date());
    } else {
      const d = new Date(); d.setDate(d.getDate() - (r.days - 1));
      start = localISO(d);
    }
    return dailyBalances(transactions || [], Number(currentBalance) || 0, start);
  }, [transactions, currentBalance, range, firstDate]);

  const first = data[0]?.balance ?? 0;
  const last = data[data.length - 1]?.balance ?? 0;
  const change = last - first;
  const spansYears = data.length > 300;

  // ~6 evenly spaced date labels, always including the first and last day.
  const ticks = useMemo(() => {
    if (data.length <= 1) return data.map((d) => d.date);
    const n = Math.min(6, data.length);
    return [...new Set([...Array(n)].map((_, i) => data[Math.round((i * (data.length - 1)) / (n - 1))].date))];
  }, [data]);

  // Table rows: daily for 1M, yearly for All when it spans years, else monthly.
  const rows = useMemo(() => {
    const group = range === '1M' ? 'day' : range === 'ALL' && spansYears ? 'year' : 'month';
    const keyOf = (iso) => (group === 'day' ? iso : group === 'month' ? iso.slice(0, 7) : iso.slice(0, 4));
    const map = new Map();
    for (const d of data) map.set(keyOf(d.date), d); // last day of each period wins = closing balance
    const list = [...map.entries()].map(([k, d]) => ({ key: k, close: d.balance }));
    list.forEach((row, i) => { row.change = i ? row.close - list[i - 1].close : null; });
    const label = (k) => (group === 'day' ? dayLabel(k) : group === 'month' ? `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}` : k);
    return { group, list: list.reverse().map((r) => ({ ...r, label: label(r.key) })) };
  }, [data, range, spansYears]);

  return (
    <div className="card" style={{ padding: '16px 14px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div className="font-num" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{formatCurrency(last, currency)}</div>
          <div className="font-num" style={{ fontSize: 12, marginTop: 2, color: change > 0 ? 'var(--green)' : change < 0 ? 'var(--red)' : 'var(--text-2)' }}>
            {change > 0 ? '▲' : change < 0 ? '▼' : '•'} {formatShort(Math.abs(change), currency)} <span style={{ color: 'var(--text-2)' }}>since {longLabel(data[0]?.date || localISO(new Date()))}</span>
          </div>
        </div>
        <button onClick={() => setAsTable((v) => !v)}
          style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Onest', padding: '4px 0' }}>
          {asTable ? 'Switch to chart' : 'Switch to table'} ⌄
        </button>
      </div>

      <div role="tablist" aria-label="Time range" style={{ display: 'flex', gap: 6, margin: '12px 0 8px' }}>
        {RANGES.map((r) => (
          <button key={r.id} role="tab" aria-selected={range === r.id} className={`chip ${range === r.id ? 'active' : ''}`} onClick={() => setRange(r.id)} style={{ flex: 1, justifyContent: 'center', padding: '6px 0' }}>
            {r.label}
          </button>
        ))}
      </div>

      {!asTable ? (
        <div style={{ margin: '0 -6px' }}>
          <ResponsiveContainer width="100%" height={190}>
            <AreaChart data={data} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gBalanceHistory" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={LINE} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={LINE} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,244,228,0.07)" strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="date" ticks={ticks} interval={0} tickFormatter={(iso) => (spansYears ? `${MONTHS[parse(iso).getMonth()]} '${String(parse(iso).getFullYear()).slice(2)}` : dayLabel(iso))}
                tick={{ fill: '#8496B8', fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={4} />
              <YAxis width={44} tick={{ fill: '#8496B8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => axisNum(v, currency)} />
              {data.some((d) => d.balance < 0) && <ReferenceLine y={0} stroke="rgba(246,240,230,0.5)" />}
              <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ stroke: 'rgba(246,240,230,0.35)', strokeWidth: 1, strokeDasharray: '3 3' }} />
              <Area type="monotone" dataKey="balance" stroke={LINE} strokeWidth={2} fill="url(#gBalanceHistory)" dot={false}
                activeDot={{ r: 5, fill: LINE, stroke: 'var(--card)', strokeWidth: 2 }} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div style={{ maxHeight: 260, overflowY: 'auto', marginTop: 4 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: 'var(--text-2)', fontSize: 11, textAlign: 'left' }}>
                <th style={{ padding: '6px 4px', fontWeight: 600 }}>{rows.group === 'day' ? 'Day' : rows.group === 'month' ? 'Month' : 'Year'}</th>
                <th style={{ padding: '6px 4px', fontWeight: 600, textAlign: 'right' }}>Closing balance</th>
                <th style={{ padding: '6px 4px', fontWeight: 600, textAlign: 'right' }}>Change</th>
              </tr>
            </thead>
            <tbody>
              {rows.list.map((r) => (
                <tr key={r.key} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 4px', color: 'var(--text)' }}>{r.label}</td>
                  <td className="font-num" style={{ padding: '8px 4px', textAlign: 'right', color: 'var(--text)' }}>{formatShort(r.close, currency)}</td>
                  <td className="font-num" style={{ padding: '8px 4px', textAlign: 'right', color: r.change == null ? 'var(--text-3)' : r.change > 0 ? 'var(--green)' : r.change < 0 ? 'var(--red)' : 'var(--text-2)' }}>
                    {r.change == null ? '—' : `${r.change > 0 ? '+' : r.change < 0 ? '−' : ''}${formatShort(Math.abs(r.change), currency)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
