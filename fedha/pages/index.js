import { useState } from 'react';
import Layout from '../components/Layout';
import TransactionModal from '../components/TransactionModal';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatShort, formatDate, formatDateRelative, getCategoryById, groupByDay, monthRange } from '../lib/utils';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { format } from 'date-fns';

function StatCard({ label, value, currency, sub, color = 'var(--green)' }) {
  return (
    <div className="card-2" style={{ padding: '14px 16px', flex: '1 1 0' }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div className="font-num" style={{ fontSize: 16, fontWeight: 700, color }}>{formatShort(value, currency)}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function CustomTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ fontSize: 13, fontWeight: 600, color: p.color, fontFamily: 'DM Mono' }}>
          {p.name === 'income' ? '↑ ' : '↓ '}{formatShort(p.value, currency)}
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { loading, wallets, transactions, budgets, loans, goals, currency, netWorth, totalBalance, totalBorrowed } = useApp();
  const [showAdd, setShowAdd] = useState(false);

  if (loading) {
    return (
      <Layout onFab={() => setShowAdd(true)}>
        <div style={{ padding: '80px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[...Array(5)].map((_, i) => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 16 }} />)}
        </div>
      </Layout>
    );
  }

  const { from, to } = monthRange(0);
  const monthTxns = transactions.filter((t) => t.date >= from && t.date <= to);
  const monthExpense = monthTxns.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const monthIncome = monthTxns.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const chartData = groupByDay(transactions, 7);
  const recent = transactions.slice(0, 5);
  const activeLoans = loans.filter((l) => l.status === 'active');
  const overBudget = budgets.filter((b) => (b.spent || 0) > b.allocated);
  const impulseCount = monthTxns.filter((t) => t.is_impulse).length;
  const impulseTotal = monthTxns.filter((t) => t.is_impulse).reduce((s, t) => s + Number(t.amount), 0);

  return (
    <Layout onFab={() => setShowAdd(true)}>
      <div className="page">
        {/* Header */}
        <div style={{ padding: '52px 20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 2 }}>
                {format(new Date(), 'EEEE, d MMMM')}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>Fedha 💚</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-3)' }}>
              <div className="online-dot" />
              Online
            </div>
          </div>
        </div>

        {/* Net worth hero */}
        <div className="section">
          <div className="hero-card" style={{ padding: '24px 20px' }}>
            <div style={{ fontSize: 12, color: 'rgba(237,242,255,0.5)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
              Net Worth
            </div>
            <div className="font-num" style={{ fontSize: 34, fontWeight: 700, color: netWorth >= 0 ? 'var(--green)' : 'var(--red)', marginBottom: 16 }}>
              {formatCurrency(netWorth, currency)}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <StatCard label="Wallets" value={totalBalance} currency={currency} />
              <StatCard label="Borrowed" value={totalBorrowed} currency={currency} sub="You owe" color="var(--red)" />
            </div>
          </div>
        </div>

        {/* Monthly summary */}
        <div className="section">
          <div className="section-title">This Month</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <StatCard label="Income" value={monthIncome} currency={currency} />
            <StatCard label="Expenses" value={monthExpense} currency={currency} color="var(--red)" />
          </div>
          {impulseCount > 0 && (
            <div style={{ marginTop: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>⚡</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#F59E0B' }}>{impulseCount} impulse purchase{impulseCount > 1 ? 's' : ''} this month</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{formatShort(impulseTotal, currency)} spent on impulse</div>
              </div>
            </div>
          )}
        </div>

        {/* 7-day chart */}
        <div className="section">
          <div className="section-title">Last 7 Days</div>
          <div className="card" style={{ padding: '16px 4px 8px' }}>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={chartData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gExpense" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1F2D45" strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#3D5070', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#3D5070', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                <Tooltip content={<CustomTooltip currency={currency} />} />
                <Area type="monotone" dataKey="income" stroke="#10B981" strokeWidth={2} fill="url(#gIncome)" dot={false} />
                <Area type="monotone" dataKey="expense" stroke="#EF4444" strokeWidth={2} fill="url(#gExpense)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 20, padding: '8px 0 4px', fontSize: 12, color: 'var(--text-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 2, background: '#10B981', display: 'inline-block', borderRadius: 1 }} /> Income</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 2, background: '#EF4444', display: 'inline-block', borderRadius: 1 }} /> Expenses</div>
            </div>
          </div>
        </div>

        {/* Wallet balances */}
        <div className="section">
          <div className="section-title">Wallets</div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
            {wallets.map((w) => (
              <div key={w.id} className="card" style={{ minWidth: 140, padding: '14px 16px', flexShrink: 0, borderColor: `${w.color}30` }}>
                <div style={{ fontSize: 22, marginBottom: 8 }}>{w.icon}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>{w.name}</div>
                <div className="font-num" style={{ fontSize: 16, fontWeight: 700, color: w.color }}>{formatShort(w.balance, w.currency || currency)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Alerts */}
        {(overBudget.length > 0 || activeLoans.length > 0) && (
          <div className="section">
            <div className="section-title">Alerts</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {overBudget.map((b) => (
                <div key={b.id} style={{ background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>🚨</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)' }}>{b.name} budget exceeded</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Spent {formatShort(b.spent, currency)} of {formatShort(b.allocated, currency)}</div>
                  </div>
                </div>
              ))}
              {activeLoans.slice(0, 2).map((l) => (
                <div key={l.id} style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>{l.type === 'borrowed' ? '📤' : '📥'}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--blue)' }}>
                      {l.type === 'borrowed' ? `Owe ${l.contact_name}` : `${l.contact_name} owes you`}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{formatShort(l.remaining || l.amount, currency)} · Due {formatDate(l.due_date)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent transactions */}
        <div className="section">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>Recent</div>
          </div>
          {recent.length === 0 ? (
            <div className="empty-state">
              <div className="icon">💸</div>
              <h3>No transactions yet</h3>
              <p>Tap + to record your first one</p>
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              {recent.map((tx, i) => {
                const cat = getCategoryById(tx.category);
                const wallet = wallets.find((w) => w.id === tx.wallet_id);
                return (
                  <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < recent.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: `${cat.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                      {tx.type === 'transfer' ? '⇄' : cat.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {tx.description || cat.label}
                        </span>
                        {tx.is_impulse && <span className="impulse-badge">IMPULSE</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                        {wallet?.name} · {formatDate(tx.date)}
                      </div>
                    </div>
                    <div className="font-num" style={{ fontSize: 15, fontWeight: 700, color: tx.type === 'income' ? 'var(--green)' : tx.type === 'transfer' ? 'var(--blue)' : 'var(--red)', flexShrink: 0 }}>
                      {tx.type === 'income' ? '+' : tx.type === 'transfer' ? '' : '-'}{formatShort(tx.amount, tx.currency || currency)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Goals quick view */}
        {goals.length > 0 && (
          <div className="section">
            <div className="section-title">Savings Goals</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {goals.slice(0, 3).map((g) => {
                const pct = Math.min(100, ((g.current || 0) / g.target) * 100);
                return (
                  <div key={g.id} className="card" style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{g.icon || '🎯'} {g.name}</div>
                      <div className="font-num" style={{ fontSize: 13, color: 'var(--green)' }}>{pct.toFixed(0)}%</div>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${pct}%`, background: g.color || 'var(--green)' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: 'var(--text-3)' }}>
                      <span>{formatShort(g.current, currency)}</span>
                      <span>{formatShort(g.target, currency)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showAdd && <TransactionModal onClose={() => setShowAdd(false)} />}
    </Layout>
  );
}
