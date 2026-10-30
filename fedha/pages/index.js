import { useEffect, useState } from 'react';
import Link from 'next/link';
import Layout from '../components/Layout';
import TransactionModal from '../components/TransactionModal';
import SavingsMotivator from '../components/SavingsMotivator';
import SavingsChallenges from '../components/SavingsChallenges';
import BalanceHistoryChart from '../components/BalanceHistoryChart';
import BinancePortfolioCard from '../components/BinancePortfolioCard';
import MoneyInCard from '../components/MoneyInCard';
import MoneyPulse from '../components/MoneyPulse';
import CountUp from '../components/CountUp';
import LuxeMark from '../components/LuxeMark';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatShort, formatDate, formatDateRelative, getCategoryById, groupByDay, monthRange } from '../lib/utils';
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


// True on PC-width screens. Starts false so the server render and first
// paint match the phone layout, then switches after mount.
function useIsDesktop() {
  const [desk, setDesk] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 960px)');
    const on = () => setDesk(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return desk;
}

// Progress ring: one value out of 100.
function Ring({ pct, color, label, value, sub }) {
  const r = 22, c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct || 0));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 0' }}>
      <svg width="56" height="56" viewBox="0 0 56 56" role="img" aria-label={`${label} ${Math.round(p)}%`} style={{ flexShrink: 0 }}>
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--card-2)" strokeWidth="5" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={`${(p / 100) * c} ${c}`} transform="rotate(-90 28 28)" />
        <text x="28" y="32" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text)">{Math.round(p)}%</text>
      </svg>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{label}</div>
        <div className="font-num" style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
}

function Panel({ title, action, children, style }) {
  return (
    <div className="card desk-panel" style={style}>
      {(title || action) && (
        <div className="desk-panel-head">
          <span>{title}</span>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export default function Dashboard() {
  const { loading, wallets, transactions, budgets, loans, goals, currency, netWorth, totalBalance, totalBorrowed } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const isDesktop = useIsDesktop();

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
  const recent = transactions.slice(0, 5);
  const activeLoans = loans.filter((l) => l.status === 'active');
  const overBudget = budgets.filter((b) => (b.spent || 0) > b.allocated);
  const impulseCount = monthTxns.filter((t) => t.is_impulse).length;
  const impulseTotal = monthTxns.filter((t) => t.is_impulse).reduce((s, t) => s + Number(t.amount), 0);
  const since30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const flow30 = transactions.filter((t) => t.date >= since30).reduce((s, t) => s + (t.type === 'income' ? Number(t.amount) : t.type === 'expense' ? -Number(t.amount) : 0), 0);

  if (isDesktop) {
    return (
      <Layout onFab={() => setShowAdd(true)}>
        <DesktopDashboard
          {...{ wallets, transactions, goals, currency, netWorth, totalBalance, totalBorrowed, monthIncome, monthExpense, recent, activeLoans, overBudget, budgets, impulseCount, impulseTotal }}
          onAdd={() => setShowAdd(true)}
        />
        {showAdd && <TransactionModal onClose={() => setShowAdd(false)} />}
      </Layout>
    );
  }

  return (
    <Layout onFab={() => setShowAdd(true)}>
      <div className="page">
        {/* Header */}
        <div className="lx-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="lx-h1">{(() => { const h = new Date().getHours(); return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; })()}</h1>
            <div style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 4 }}>{format(new Date(), 'EEEE, d MMMM')}</div>
          </div>
          <LuxeMark size={38} animated />
        </div>

        {/* Net worth hero */}
        <div className="section" style={{ marginTop: 14 }}>
          <div className="hero-card" style={{ padding: '22px 20px 18px' }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>Net worth</div>
            <div className="font-num" style={{ fontSize: 38, fontWeight: 700, margin: '8px 0 4px', color: netWorth >= 0 ? 'var(--text)' : 'var(--red)', letterSpacing: '-0.035em', lineHeight: 1.05 }}>
              <CountUp value={netWorth} format={(n) => formatCurrency(n, currency)} />
            </div>
            <div style={{ fontSize: 12.5, color: flow30 >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600, marginBottom: 16 }}>
              {flow30 >= 0 ? '▲' : '▼'} {formatShort(Math.abs(flow30), currency)} <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>in the last 30 days</span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <StatCard label="Wallets" value={totalBalance} currency={currency} color="var(--text)" />
              <StatCard label="You owe" value={totalBorrowed} currency={currency} color={totalBorrowed > 0 ? 'var(--red)' : 'var(--text-2)'} />
            </div>
          </div>
        </div>

        {/* Money pulse: savings rate, 6 months in vs out, where it went, month-end pace */}
        <div className="section">
          <div className="section-title">This month</div>
          <MoneyPulse transactions={transactions} currency={currency} />
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

        {/* Money in: what came in today / this week, streak, last 14 days */}
        <div className="section"><MoneyInCard transactions={transactions} /></div>

        {/* Balance over time — right under this month's income and expenses */}
        <div className="section">
          <div className="section-title">Balance Over Time</div>
          <BalanceHistoryChart transactions={transactions} currentBalance={totalBalance} currency={currency} />
        </div>

        {/* Wallet balances */}
        <div className="section">
          <div className="section-title">Wallets</div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
            {wallets.filter((w) => !w.pocket).map((w) => (
              <Link key={w.id} href="/wallets" className="card lx-wcard" style={{ '--wc': w.color || '#888', minWidth: 158, padding: '14px 16px', flexShrink: 0, textDecoration: 'none', color: 'var(--text)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                  <span style={{ fontSize: 20 }}>{w.icon}</span>
                  <span className="lx-chip-dot" />
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginBottom: 3, letterSpacing: '.02em' }}>{w.name}</div>
                <div className="font-num" style={{ fontSize: 18, fontWeight: 700 }}>{formatShort(w.balance, w.currency || currency)}</div>
                <ZiidiLine wallets={wallets} parent={w} currency={w.currency || currency} />
              </Link>
            ))}
          </div>
        </div>

        {/* Investments */}
        <div className="section">
          <div className="section-title">Investments</div>
          <BinancePortfolioCard />
        </div>

        {/* Savings motivation */}
        <SavingsMotivator />

        {/* Savings challenges */}
        <SavingsChallenges />

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

// ─── PC DASHBOARD ────────────────────────────────────────────────────────────
// Same data as the phone home, laid out as a dashboard: main column on the
// left, a quick-actions / progress column on the right.
function TxRow({ tx, wallets, currency, last }) {
  const cat = getCategoryById(tx.category);
  const wallet = wallets.find((w) => w.id === tx.wallet_id);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${cat.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
        {tx.type === 'transfer' ? '⇄' : cat.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description || cat.label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{wallet?.name} · {formatDateRelative ? formatDateRelative(tx.date) : formatDate(tx.date)}</div>
      </div>
      <div className="font-num" style={{ fontSize: 13, fontWeight: 700, flexShrink: 0, color: tx.type === 'income' ? 'var(--green)' : tx.type === 'transfer' ? 'var(--blue)' : 'var(--red)' }}>
        {tx.type === 'income' ? '+' : tx.type === 'transfer' ? '' : '−'}{formatShort(tx.amount, tx.currency || currency)}
      </div>
    </div>
  );
}

function DesktopDashboard({ wallets, transactions, goals, currency, netWorth, totalBalance, totalBorrowed, monthIncome, monthExpense, recent, activeLoans, overBudget, budgets, impulseCount, impulseTotal, onAdd }) {
  const net = monthIncome - monthExpense;
  const spentPct = monthIncome > 0 ? Math.min(100, (monthExpense / monthIncome) * 100) : (monthExpense > 0 ? 100 : 0);
  const totalAllocated = budgets.reduce((s, b) => s + (Number(b.allocated) || 0), 0);
  const totalSpent = budgets.reduce((s, b) => s + (Number(b.spent) || 0), 0);
  const goalTarget = goals.reduce((s, g) => s + (Number(g.target) || 0), 0);
  const goalSaved = goals.reduce((s, g) => s + (Number(g.current) || 0), 0);
  const savingsRate = monthIncome > 0 ? Math.max(0, (net / monthIncome) * 100) : 0;

  const stats = [
    { icon: '👛', label: 'In wallets', value: formatShort(totalBalance, currency), color: 'var(--green)' },
    { icon: '📥', label: 'Income', value: formatShort(monthIncome, currency), sub: 'this month', color: 'var(--green)' },
    { icon: '📤', label: 'Spent', value: formatShort(monthExpense, currency), sub: 'this month', color: 'var(--red)' },
    { icon: '🤝', label: 'You owe', value: formatShort(totalBorrowed, currency), color: totalBorrowed > 0 ? 'var(--yellow)' : 'var(--text)' },
  ];

  const actions = [
    { label: 'Record transaction', icon: '➕', onClick: onAdd, primary: true },
    { label: 'Plan my day', icon: '📅', href: '/planner' },
    { label: 'Check budgets', icon: '📊', href: '/budgets' },
    { label: 'Log a meal', icon: '🍽️', href: '/meals' },
  ];

  return (
    <div className="desk-page">
      <div className="desk-grid">
        {/* ── Main column ── */}
        <div className="desk-col">
          <div className="hero-card desk-hero">
            <div style={{ position: 'relative', zIndex: 1, flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500 }}>Net worth</div>
              <div className="font-num" style={{ fontSize: 36, fontWeight: 700, margin: '4px 0 14px', color: netWorth >= 0 ? 'var(--text)' : 'var(--red)' }}>
                {formatCurrency(netWorth, currency)}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-2)', marginBottom: 6, maxWidth: 420 }}>
                <span>Spent {formatShort(monthExpense, currency)} of {formatShort(monthIncome, currency)} earned this month</span>
                <span className="font-num">{Math.round(spentPct)}%</span>
              </div>
              <div className="progress-bar" style={{ maxWidth: 420, height: 8 }}>
                <div className="progress-fill" style={{ width: `${spentPct}%`, background: spentPct > 90 ? 'var(--red)' : spentPct > 70 ? 'var(--yellow)' : 'var(--green)' }} />
              </div>
              <div className="desk-hero-stats">
                {stats.map((s) => (
                  <div key={s.label} className="desk-hero-stat">
                    <span className="desk-hero-icon">{s.icon}</span>
                    <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{s.label}</div>
                    <div className="font-num" style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{s.value}</div>
                    {s.sub && <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{s.sub}</div>}
                  </div>
                ))}
              </div>
            </div>
            <div className="desk-hero-side">
              <div className="desk-hero-badge">{net >= 0 ? '▲' : '▼'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Net this month</div>
              <div className="font-num" style={{ fontSize: 20, fontWeight: 700, color: net >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {net >= 0 ? '+' : '−'}{formatShort(Math.abs(net), currency)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 8, lineHeight: 1.4 }}>
                {net >= 0 ? 'Good money fuels great things.' : 'Spending is ahead of income. Slow down.'}
              </div>
            </div>
          </div>

          <Panel title="Investments">
            <BinancePortfolioCard />
          </Panel>

          <MoneyInCard transactions={transactions} />

          <Panel title="Money pulse">
            <MoneyPulse transactions={transactions} currency={currency} />
          </Panel>
          <Panel title="Balance over time">
            <BalanceHistoryChart transactions={transactions} currentBalance={totalBalance} currency={currency} />
          </Panel>

          <Panel title="Wallets" action={<Link href="/wallets" className="desk-link">View all →</Link>}>
            {wallets.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>No wallets yet.</div>
            ) : (
              <div className="desk-wallets">
                {wallets.filter((w) => !w.pocket).map((w) => (
                  <div key={w.id} className="card-2" style={{ padding: '14px', borderColor: `${w.color}40` }}>
                    <div style={{ fontSize: 22, marginBottom: 6 }}>{w.icon}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</div>
                    <div className="font-num" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>{formatShort(w.balance, w.currency || currency)}</div>
                    <ZiidiLine wallets={wallets} parent={w} currency={w.currency || currency} />
                    <div style={{ height: 3, borderRadius: 2, background: w.color, marginTop: 10, opacity: 0.8 }} />
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <div className="desk-two">
            <Panel title="Recent activity" action={<Link href="/transactions" className="desk-link">View all →</Link>}>
              {recent.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-2)' }}>No transactions yet.</div>
              ) : recent.map((tx, i) => <TxRow key={tx.id} tx={tx} wallets={wallets} currency={currency} last={i === recent.length - 1} />)}
            </Panel>
            <div className="desk-embed">
              <SavingsMotivator />
            </div>
          </div>

          <div className="desk-embed">
            <SavingsChallenges />
          </div>
        </div>

        {/* ── Right column ── */}
        <div className="desk-col">
          <Panel title="Quick actions">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {actions.map((a) => {
                const cls = `desk-action ${a.primary ? 'primary' : ''}`;
                const inner = <><span className="desk-action-icon">{a.icon}</span>{a.label}</>;
                return a.href
                  ? <Link key={a.label} href={a.href} className={cls}>{inner}</Link>
                  : <button key={a.label} className={cls} onClick={a.onClick}>{inner}</button>;
              })}
            </div>
          </Panel>

          <Panel title="This month">
            <Ring pct={spentPct} color={spentPct > 90 ? 'var(--red)' : 'var(--green)'} label="Income spent" value={`${formatShort(monthExpense, currency)} / ${formatShort(monthIncome, currency)}`} />
            <Ring pct={totalAllocated ? (totalSpent / totalAllocated) * 100 : 0} color="var(--blue)" label="Budget used" value={totalAllocated ? `${formatShort(totalSpent, currency)} / ${formatShort(totalAllocated, currency)}` : 'No budgets set'} />
            <Ring pct={savingsRate} color="var(--gold)" label="Saved of income" value={formatShort(Math.max(0, net), currency)} />
          </Panel>

          {(overBudget.length > 0 || activeLoans.length > 0 || impulseCount > 0) && (
            <Panel title="Alerts">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {overBudget.map((b) => (
                  <div key={b.id} className="desk-alert" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
                    <span>🚨</span>
                    <div><b style={{ color: 'var(--red)' }}>{b.name}</b> over budget<div className="desk-alert-sub">{formatShort(b.spent, currency)} of {formatShort(b.allocated, currency)}</div></div>
                  </div>
                ))}
                {impulseCount > 0 && (
                  <div className="desk-alert" style={{ borderColor: 'rgba(245,158,11,0.3)' }}>
                    <span>⚡</span>
                    <div><b style={{ color: 'var(--yellow)' }}>{impulseCount} impulse buy{impulseCount > 1 ? 's' : ''}</b><div className="desk-alert-sub">{formatShort(impulseTotal, currency)} this month</div></div>
                  </div>
                )}
                {activeLoans.slice(0, 3).map((l) => (
                  <div key={l.id} className="desk-alert" style={{ borderColor: 'rgba(59,130,246,0.3)' }}>
                    <span>{l.type === 'borrowed' ? '📤' : '📥'}</span>
                    <div><b style={{ color: 'var(--blue)' }}>{l.type === 'borrowed' ? `Owe ${l.contact_name}` : `${l.contact_name} owes you`}</b>
                      <div className="desk-alert-sub">{formatShort(l.remaining || l.amount, currency)} · due {formatDate(l.due_date)}</div></div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <Panel title="Savings goals" action={<Link href="/goals" className="desk-link">Edit</Link>}>
            {goals.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Set a goal to see your progress here.</div>
            ) : (
              <>
                {goals.slice(0, 4).map((g) => {
                  const pct = g.target ? Math.min(100, ((g.current || 0) / g.target) * 100) : 0;
                  return (
                    <div key={g.id} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                        <span style={{ fontWeight: 600 }}>{g.icon || '🎯'} {g.name}</span>
                        <span className="font-num" style={{ color: 'var(--text-2)', fontSize: 12 }}>{formatShort(g.target, currency)}</span>
                      </div>
                      <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%`, background: g.color || 'var(--green)' }} /></div>
                    </div>
                  );
                })}
                {goalTarget > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                    {formatShort(goalSaved, currency)} saved of {formatShort(goalTarget, currency)} across all goals
                  </div>
                )}
              </>
            )}
          </Panel>
        </div>
      </div>
      <footer className="desk-footer">
        <span style={{ color: 'var(--green)', fontWeight: 700 }}>Luxe</span>
        <span>© {new Date().getFullYear()} Luxe</span>
      </footer>
    </div>
  );
}

// Under an M-Pesa wallet: its Ziidi and locked savings, so the main number is only what you can spend.
function ZiidiLine({ wallets, parent, currency }) {
  const z = wallets.find((w) => w.parent_id === parent.id && w.pocket === 'ziidi');
  const l = wallets.find((w) => w.parent_id === parent.id && w.pocket === 'ziidi_locked');
  if (!z && !l) return null;
  return (
    <div className="font-num" style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.5 }}>
      {z && <div>📈 Ziidi {formatShort(z.balance, currency)}</div>}
      {l && <div>🔒 Locked {formatShort(l.balance, currency)}</div>}
    </div>
  );
}
