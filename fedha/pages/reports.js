import { useState, useMemo } from 'react';
import Layout from '../components/Layout';
import TransactionModal from '../components/TransactionModal';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatShort, groupByDay, groupByCategory, groupByMonth, monthRange, CURRENCIES } from '../lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';
import { format } from 'date-fns';

function CustomBarTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
      <div style={{ color: 'var(--text-3)', marginBottom: 6 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color, fontWeight: 600, fontFamily: 'DM Mono' }}>
          {p.name === 'income' ? '↑ ' : '↓ '}{formatShort(p.value, currency)}
        </div>
      ))}
    </div>
  );
}

function CustomPieTooltip({ active, payload, currency }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
      <div style={{ color: payload[0].payload.color, fontWeight: 700 }}>{payload[0].name}</div>
      <div style={{ color: 'var(--text)', fontFamily: 'DM Mono', marginTop: 2 }}>{formatCurrency(payload[0].value, currency)}</div>
    </div>
  );
}

export default function ReportsPage() {
  const { transactions, wallets, goals, loans, budgets, currency, setCurrency } = useApp();
  const [tab, setTab] = useState('overview');
  const [period, setPeriod] = useState('month');
  const [showTxn, setShowTxn] = useState(false);

  const { from, to, label: monthLabel } = monthRange(0);

  const monthTxns = useMemo(() =>
    transactions.filter((t) => t.date >= from && t.date <= to),
    [transactions, from, to]
  );

  const monthExpenses = monthTxns.filter((t) => t.type === 'expense');
  const monthIncomes = monthTxns.filter((t) => t.type === 'income');
  const totalExpense = monthExpenses.reduce((s, t) => s + Number(t.amount), 0);
  const totalIncome = monthIncomes.reduce((s, t) => s + Number(t.amount), 0);
  const savings = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? (savings / totalIncome) * 100 : 0;

  const dayData = groupByDay(transactions, period === 'week' ? 7 : 30);
  const catData = groupByCategory(monthExpenses);
  const monthData = groupByMonth(transactions, 6);
  const impulseData = monthTxns.filter((t) => t.is_impulse);
  const impulsePct = monthExpenses.length > 0 ? (impulseData.length / monthExpenses.length) * 100 : 0;

  const totalBalance = wallets.reduce((s, w) => s + Number(w.balance || 0), 0);
  const totalBorrowed = loans.filter((l) => l.type === 'borrowed' && l.status === 'active').reduce((s, l) => s + Number(l.remaining || l.amount), 0);
  const totalLent = loans.filter((l) => l.type === 'lent' && l.status === 'active').reduce((s, l) => s + Number(l.remaining || l.amount), 0);
  const totalGoalSaved = goals.reduce((s, g) => s + (g.current || 0), 0);
  const netWorth = totalBalance + totalLent - totalBorrowed;

  async function exportCSV() {
    const header = 'Date,Type,Category,Amount,Wallet,Description,Impulse\n';
    const rows = transactions.map((t) => {
      const w = wallets.find((w) => w.id === t.wallet_id);
      return `${t.date},${t.type},${t.category || ''},${t.amount},"${w?.name || ''}","${t.description || ''}",${t.is_impulse ? 'Yes' : 'No'}`;
    }).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fedha-export-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportPDF() {
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // Header
    doc.setFillColor(8, 12, 24);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(16, 185, 129);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('FEDHA', 14, 20);
    doc.setTextColor(150, 170, 200);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Personal Finance Report', 14, 28);
    doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy')}`, 14, 34);

    // Summary
    doc.setTextColor(50, 50, 80);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(`${monthLabel} Summary`, 14, 52);

    const summaryData = [
      ['Total Income', formatCurrency(totalIncome, currency)],
      ['Total Expenses', formatCurrency(totalExpense, currency)],
      ['Net Savings', formatCurrency(savings, currency)],
      ['Savings Rate', `${savingsRate.toFixed(1)}%`],
      ['Net Worth', formatCurrency(netWorth, currency)],
    ];

    autoTable(doc, {
      startY: 56,
      body: summaryData,
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 4 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 }, 1: { halign: 'right' } },
    });

    // Wallet balances
    const walletY = doc.lastAutoTable.finalY + 12;
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(50, 50, 80);
    doc.text('Wallet Balances', 14, walletY);

    autoTable(doc, {
      startY: walletY + 4,
      head: [['Wallet', 'Type', 'Balance']],
      body: wallets.map((w) => [w.name, w.type, formatCurrency(w.balance, w.currency || currency)]),
      theme: 'striped',
      styles: { fontSize: 9 },
      headStyles: { fillColor: [16, 185, 129] },
    });

    // Transactions
    const txnY = doc.lastAutoTable.finalY + 12;
    doc.addPage();
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(50, 50, 80);
    doc.text('All Transactions', 14, 20);

    autoTable(doc, {
      startY: 24,
      head: [['Date', 'Type', 'Description', 'Amount', 'Wallet']],
      body: transactions.slice(0, 200).map((t) => {
        const w = wallets.find((w) => w.id === t.wallet_id);
        return [
          t.date,
          t.type,
          t.description || t.category || '',
          formatCurrency(t.amount, currency),
          w?.name || ''
        ];
      }),
      theme: 'striped',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [16, 185, 129] },
    });

    doc.save(`fedha-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  }

  return (
    <Layout onFab={() => setShowTxn(true)}>
      <div className="page">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700 }}>Reports</h1>
            {/* Currency switcher */}
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              style={{ background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, padding: '6px 10px', fontFamily: 'Outfit', cursor: 'pointer' }}
            >
              {Object.keys(CURRENCIES).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
            {[['overview', '📊 Overview'], ['categories', '🍩 Categories'], ['networth', '📈 Net Worth']].map(([v, l]) => (
              <button key={v} className={`chip ${tab === v ? 'active' : ''}`} onClick={() => setTab(v)}>{l}</button>
            ))}
          </div>
        </div>

        {/* ── OVERVIEW ─────────────────────────────────────────────────── */}
        {tab === 'overview' && (
          <div>
            {/* Month summary cards */}
            <div style={{ padding: '0 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              {[
                { label: 'Income', val: totalIncome, color: 'var(--green)' },
                { label: 'Expenses', val: totalExpense, color: 'var(--red)' },
                { label: 'Savings', val: savings, color: savings >= 0 ? 'var(--green)' : 'var(--red)' },
                { label: 'Savings Rate', val: null, display: `${savingsRate.toFixed(1)}%`, color: savingsRate >= 20 ? 'var(--green)' : savingsRate >= 10 ? '#F59E0B' : 'var(--red)' },
              ].map((s) => (
                <div key={s.label} className="card-2" style={{ padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
                  <div className="font-num" style={{ fontSize: 17, fontWeight: 700, color: s.color }}>
                    {s.display || formatShort(s.val, currency)}
                  </div>
                </div>
              ))}
            </div>

            {/* Impulse spending insight */}
            {impulseData.length > 0 && (
              <div className="section">
                <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span style={{ fontSize: 22 }}>⚡</span>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#F59E0B' }}>Impulse Spending This Month</div>
                  </div>
                  <div style={{ display: 'flex', gap: 20, fontSize: 13 }}>
                    <div><span style={{ color: 'var(--text-3)' }}>Transactions: </span><span style={{ color: '#F59E0B', fontWeight: 600 }}>{impulseData.length}</span></div>
                    <div><span style={{ color: 'var(--text-3)' }}>Total: </span><span className="font-num" style={{ color: '#F59E0B', fontWeight: 600 }}>{formatShort(impulseData.reduce((s, t) => s + Number(t.amount), 0), currency)}</span></div>
                    <div><span style={{ color: 'var(--text-3)' }}>Rate: </span><span style={{ color: '#F59E0B', fontWeight: 600 }}>{impulsePct.toFixed(0)}%</span></div>
                  </div>
                </div>
              </div>
            )}

            {/* Monthly 6-month bar chart */}
            <div className="section">
              <div className="section-title">6-Month Trend</div>
              <div className="card" style={{ padding: '16px 4px 8px' }}>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={monthData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }} barSize={18} barGap={4}>
                    <CartesianGrid stroke="#1F2D45" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#3D5070', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#3D5070', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                    <Tooltip content={<CustomBarTooltip currency={currency} />} />
                    <Bar dataKey="income" fill="#10B981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expense" fill="#EF4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 20, padding: '4px 0 4px', fontSize: 12, color: 'var(--text-3)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, background: '#10B981', display: 'inline-block', borderRadius: 2 }} /> Income</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, background: '#EF4444', display: 'inline-block', borderRadius: 2 }} /> Expenses</div>
                </div>
              </div>
            </div>

            {/* Export buttons */}
            <div className="section">
              <div className="section-title">Export</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-ghost" onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  📥 Export CSV
                </button>
                <button className="btn-ghost" onClick={exportPDF} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  📄 Export PDF
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── CATEGORIES ──────────────────────────────────────────────── */}
        {tab === 'categories' && (
          <div>
            <div className="section">
              <div className="section-title">{monthLabel} — Spending by Category</div>
              {catData.length === 0 ? (
                <div className="empty-state">
                  <div className="icon">🍩</div>
                  <h3>No expenses this month</h3>
                  <p>Add expenses to see category breakdown</p>
                </div>
              ) : (
                <>
                  <div className="card" style={{ padding: '16px 4px' }}>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={catData} cx="50%" cy="50%" outerRadius={85} innerRadius={48} dataKey="value" paddingAngle={3}>
                          {catData.map((entry, index) => (
                            <Cell key={index} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomPieTooltip currency={currency} />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {catData.map((c) => {
                      const pct = totalExpense > 0 ? (c.value / totalExpense) * 100 : 0;
                      return (
                        <div key={c.name} className="card-2" style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                            <span style={{ fontSize: 18 }}>{c.icon}</span>
                            <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{c.name}</span>
                            <span className="font-num" style={{ fontSize: 14, fontWeight: 700, color: c.color }}>{formatShort(c.value, currency)}</span>
                            <span style={{ fontSize: 12, color: 'var(--text-3)', minWidth: 36, textAlign: 'right' }}>{pct.toFixed(0)}%</span>
                          </div>
                          <div className="progress-bar">
                            <div className="progress-fill" style={{ width: `${pct}%`, background: c.color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── NET WORTH ─────────────────────────────────────────────── */}
        {tab === 'networth' && (
          <div style={{ padding: '0 20px' }}>
            {/* Net worth number */}
            <div className="hero-card" style={{ padding: '24px 20px', marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: 'rgba(237,242,255,0.5)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Net Worth</div>
              <div className="font-num" style={{ fontSize: 36, fontWeight: 700, color: netWorth >= 0 ? 'var(--green)' : 'var(--red)', marginBottom: 4 }}>
                {formatCurrency(netWorth, currency)}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(237,242,255,0.4)' }}>Assets − Liabilities</div>
            </div>

            {/* Breakdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Assets */}
              <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Assets</div>
              {wallets.map((w) => (
                <div key={w.id} className="card-2" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 20 }}>{w.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{w.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'capitalize' }}>{w.type}</div>
                  </div>
                  <div className="font-num" style={{ fontSize: 15, fontWeight: 700, color: Number(w.balance) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {formatCurrency(w.balance, w.currency || currency)}
                  </div>
                </div>
              ))}
              {totalLent > 0 && (
                <div className="card-2" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 20 }}>📥</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>Money Owed to Me</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Active loans out</div>
                  </div>
                  <div className="font-num" style={{ fontSize: 15, fontWeight: 700, color: 'var(--green)' }}>{formatCurrency(totalLent, currency)}</div>
                </div>
              )}
              {totalGoalSaved > 0 && (
                <div className="card-2" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 20 }}>🎯</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>Goal Savings</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{goals.length} active goals</div>
                  </div>
                  <div className="font-num" style={{ fontSize: 15, fontWeight: 700, color: 'var(--green)' }}>{formatCurrency(totalGoalSaved, currency)}</div>
                </div>
              )}

              {/* Liabilities */}
              {totalBorrowed > 0 && (
                <>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginTop: 12, marginBottom: 4 }}>Liabilities</div>
                  <div className="card-2" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, borderColor: 'rgba(239,68,68,0.2)' }}>
                    <span style={{ fontSize: 20 }}>📤</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>Money I Owe</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Active loans in</div>
                    </div>
                    <div className="font-num" style={{ fontSize: 15, fontWeight: 700, color: 'var(--red)' }}>−{formatCurrency(totalBorrowed, currency)}</div>
                  </div>
                </>
              )}

              {/* Net worth total */}
              <div style={{ marginTop: 12, padding: '14px 16px', background: netWorth >= 0 ? 'var(--green-dim)' : 'var(--red-dim)', border: `1px solid ${netWorth >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>Net Worth</span>
                <span className="font-num" style={{ fontSize: 18, fontWeight: 700, color: netWorth >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {formatCurrency(netWorth, currency)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {showTxn && <TransactionModal onClose={() => setShowTxn(false)} />}
    </Layout>
  );
}
