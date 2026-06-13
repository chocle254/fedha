import { useState } from 'react';
import Layout from '../components/Layout';
import TransactionModal from '../components/TransactionModal';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatShort, formatDate, getDaysUntil, isOverdue, EXPENSE_CATEGORIES, getCategoryById, genId, todayISO } from '../lib/utils';

function BudgetForm({ initial, onSave, onClose }) {
  const [name, setName] = useState(initial?.name || '');
  const [category, setCategory] = useState(initial?.category || 'food');
  const [allocated, setAllocated] = useState(initial?.allocated || '');
  const [period, setPeriod] = useState(initial?.period || 'monthly');

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '12px auto' }} />
        <div className="modal-header">
          <span style={{ fontSize: 16, fontWeight: 700 }}>{initial ? 'Edit Budget' : 'New Budget Envelope'}</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Category</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {EXPENSE_CATEGORIES.map((c) => (
                <button key={c.id} onClick={() => { setCategory(c.id); if (!name) setName(c.label); }}
                  style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${category === c.id ? c.color : 'var(--border)'}`, background: category === c.id ? `${c.color}22` : 'var(--card-2)', color: category === c.id ? c.color : 'var(--text-2)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'Outfit', display: 'flex', alignItems: 'center', gap: 5 }}>
                  {c.icon} {c.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Label</label>
            <input className="input" placeholder="e.g. Monthly Food Budget" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Amount</label>
            <input className="input font-num" type="number" inputMode="decimal" placeholder="0.00" value={allocated} onChange={(e) => setAllocated(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Period</label>
            <select className="input" value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          <button className="btn-primary" disabled={!name || !allocated} onClick={() => onSave({ ...initial, name, category, allocated: Number(allocated), period, id: initial?.id || genId(), spent: initial?.spent || 0 })}>
            {initial ? 'Save Changes' : 'Create Envelope'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LoanForm({ initial, onSave, onClose }) {
  const [type, setType] = useState(initial?.type || 'borrowed');
  const [contactName, setContactName] = useState(initial?.contact_name || '');
  const [amount, setAmount] = useState(initial?.amount || '');
  const [remaining, setRemaining] = useState(initial?.remaining ?? initial?.amount ?? '');
  const [dueDate, setDueDate] = useState(initial?.due_date || '');
  const [notes, setNotes] = useState(initial?.notes || '');

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '12px auto' }} />
        <div className="modal-header">
          <span style={{ fontSize: 16, fontWeight: 700 }}>{initial ? 'Edit Loan' : 'Record Loan'}</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 8 }}>
            {[['borrowed', '📤 I Borrowed'], ['lent', '📥 I Lent']].map(([v, l]) => (
              <button key={v} className={`chip ${type === v ? 'active' : ''}`} style={{ flex: 1, justifyContent: 'center' }} onClick={() => setType(v)}>{l}</button>
            ))}
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
              {type === 'borrowed' ? 'Lender Name' : 'Borrower Name'}
            </label>
            <input className="input" placeholder="Contact name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Total Amount</label>
            <input className="input font-num" type="number" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => { setAmount(e.target.value); if (!initial) setRemaining(e.target.value); }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Amount Remaining</label>
            <input className="input font-num" type="number" inputMode="decimal" placeholder="0.00" value={remaining} onChange={(e) => setRemaining(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Due Date (optional)</label>
            <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Notes</label>
            <input className="input" placeholder="Reason for loan…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <button className="btn-primary" disabled={!contactName || !amount} onClick={() => onSave({ ...initial, type, contact_name: contactName, amount: Number(amount), remaining: Number(remaining), due_date: dueDate || null, notes, id: initial?.id || genId(), status: initial?.status || 'active', created_at: initial?.created_at || new Date().toISOString() })}>
            {initial ? 'Save Changes' : 'Record Loan'}
          </button>
        </div>
      </div>
    </div>
  );
}

function IncomePlanForm({ initial, onSave, onClose }) {
  const { currency } = useApp();
  const [name, setName] = useState(initial?.name || '');
  const [expectedAmount, setExpectedAmount] = useState(initial?.expected_amount || '');
  const [expectedDate, setExpectedDate] = useState(initial?.expected_date || '');
  const [allocations, setAllocations] = useState(initial?.allocations || [{ label: '', amount: '' }]);

  function addAllocation() { setAllocations([...allocations, { label: '', amount: '' }]); }
  function updateAlloc(i, field, val) {
    const updated = [...allocations];
    updated[i] = { ...updated[i], [field]: val };
    setAllocations(updated);
  }
  function removeAlloc(i) { setAllocations(allocations.filter((_, idx) => idx !== i)); }

  const allocTotal = allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const remaining = Number(expectedAmount) - allocTotal;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '12px auto' }} />
        <div className="modal-header">
          <span style={{ fontSize: 16, fontWeight: 700 }}>{initial ? 'Edit Income Plan' : 'Plan Upcoming Income'}</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Income Source</label>
            <input className="input" placeholder="e.g. March Salary" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Expected Amount</label>
              <input className="input font-num" type="number" inputMode="decimal" placeholder="0.00" value={expectedAmount} onChange={(e) => setExpectedAmount(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Expected Date</label>
              <input className="input" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
            </div>
          </div>

          {/* Budget allocations */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>Allocations</label>
              <button onClick={addAllocation} style={{ fontSize: 12, color: 'var(--green)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Outfit', fontWeight: 600 }}>+ Add</button>
            </div>
            {allocations.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input className="input" placeholder="e.g. Rent" value={a.label} onChange={(e) => updateAlloc(i, 'label', e.target.value)} style={{ flex: 2 }} />
                <input className="input font-num" type="number" placeholder="0" value={a.amount} onChange={(e) => updateAlloc(i, 'amount', e.target.value)} style={{ flex: 1 }} />
                <button className="btn-icon" onClick={() => removeAlloc(i)}>✕</button>
              </div>
            ))}
            {expectedAmount && (
              <div style={{ padding: '10px 14px', background: remaining >= 0 ? 'var(--green-dim)' : 'var(--red-dim)', border: `1px solid ${remaining >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 10, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Unallocated</span>
                <span className="font-num" style={{ fontSize: 13, fontWeight: 700, color: remaining >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {formatCurrency(remaining, currency)}
                </span>
              </div>
            )}
          </div>

          <button className="btn-primary" disabled={!name || !expectedAmount} onClick={() => onSave({ ...initial, name, expected_amount: Number(expectedAmount), expected_date: expectedDate || null, allocations: allocations.filter((a) => a.label && a.amount), id: initial?.id || genId(), is_received: initial?.is_received || false })}>
            {initial ? 'Save Changes' : 'Create Plan'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BudgetsPage() {
  const { budgets, loans, incomePlans, addBudget, updateBudget, removeBudget, addLoan, updateLoan, removeLoan, addIncomePlan, updateIncomePlan, removeIncomePlan, currency } = useApp();
  const [tab, setTab] = useState('budgets');
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [editBudget, setEditBudget] = useState(null);
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [editLoan, setEditLoan] = useState(null);
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [editPlan, setEditPlan] = useState(null);
  const [showTxn, setShowTxn] = useState(false);

  const activeLoans = loans.filter((l) => l.status === 'active');
  const totalBorrowed = activeLoans.filter((l) => l.type === 'borrowed').reduce((s, l) => s + Number(l.remaining || l.amount), 0);
  const totalLent = activeLoans.filter((l) => l.type === 'lent').reduce((s, l) => s + Number(l.remaining || l.amount), 0);

  return (
    <Layout onFab={() => setShowTxn(true)}>
      <div className="page">
        <div className="page-header">
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Budget & Loans</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['budgets', '📋 Envelopes'], ['income', '📅 Income Plans'], ['loans', '🤝 Loans']].map(([v, l]) => (
              <button key={v} className={`chip ${tab === v ? 'active' : ''}`} onClick={() => setTab(v)}>{l}</button>
            ))}
          </div>
        </div>

        {/* ── BUDGET ENVELOPES ─────────────────────────────────────────── */}
        {tab === 'budgets' && (
          <div style={{ padding: '0 20px' }}>
            {budgets.length === 0 ? (
              <div className="empty-state">
                <div className="icon">📋</div>
                <h3>No budget envelopes yet</h3>
                <p>Set spending limits per category</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {budgets.map((b) => {
                  const cat = getCategoryById(b.category);
                  const pct = Math.min(100, ((b.spent || 0) / b.allocated) * 100);
                  const over = (b.spent || 0) > b.allocated;
                  return (
                    <div key={b.id} className="card" style={{ padding: '16px', borderColor: over ? 'rgba(239,68,68,0.3)' : undefined }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                        <div style={{ width: 42, height: 42, borderRadius: 12, background: `${cat.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{cat.icon}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{b.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'capitalize' }}>{b.period}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className="font-num" style={{ fontSize: 16, fontWeight: 700, color: over ? 'var(--red)' : 'var(--text)' }}>
                            {formatShort(b.spent || 0, currency)}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>of {formatShort(b.allocated, currency)}</div>
                        </div>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${pct}%`, background: over ? 'var(--red)' : pct > 80 ? '#F59E0B' : cat.color }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: 'var(--text-3)' }}>
                        <span>{pct.toFixed(0)}% used</span>
                        <span style={{ color: over ? 'var(--red)' : 'var(--green)' }}>
                          {over ? `${formatShort(b.spent - b.allocated, currency)} over` : `${formatShort(b.allocated - b.spent, currency)} left`}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <button onClick={() => setEditBudget(b)} style={{ flex: 1, padding: '8px', background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit' }}>✏️ Edit</button>
                        <button onClick={() => removeBudget(b.id)} style={{ flex: 1, padding: '8px', background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: 'var(--red)', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit', opacity: 0.7 }}>🗑 Remove</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <button className="btn-ghost" style={{ marginTop: 16, marginBottom: 20 }} onClick={() => setShowBudgetForm(true)}>+ New Envelope</button>
          </div>
        )}

        {/* ── INCOME PLANS ──────────────────────────────────────────────── */}
        {tab === 'income' && (
          <div style={{ padding: '0 20px' }}>
            {incomePlans.length === 0 ? (
              <div className="empty-state">
                <div className="icon">📅</div>
                <h3>No income plans yet</h3>
                <p>Plan how you'll allocate upcoming income before it arrives</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {incomePlans.map((p) => {
                  const allocTotal = (p.allocations || []).reduce((s, a) => s + (Number(a.amount) || 0), 0);
                  const unallocated = p.expected_amount - allocTotal;
                  const daysLeft = p.expected_date ? getDaysUntil(p.expected_date) : null;
                  return (
                    <div key={p.id} className="card" style={{ padding: '16px', borderColor: p.is_received ? 'rgba(16,185,129,0.3)' : undefined }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700 }}>{p.name}</div>
                          {p.expected_date && (
                            <div style={{ fontSize: 12, color: daysLeft !== null && daysLeft < 0 ? 'var(--red)' : 'var(--text-3)', marginTop: 2 }}>
                              {daysLeft !== null ? (daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'Today!' : `in ${daysLeft}d`) : formatDate(p.expected_date)}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className="font-num" style={{ fontSize: 18, fontWeight: 700, color: 'var(--green)' }}>{formatShort(p.expected_amount, currency)}</div>
                          {p.is_received && <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>✓ Received</span>}
                        </div>
                      </div>

                      {/* Allocations */}
                      {(p.allocations || []).length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          {p.allocations.map((a, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                              <span style={{ color: 'var(--text-2)' }}>{a.label}</span>
                              <span className="font-num" style={{ color: 'var(--text)', fontWeight: 600 }}>{formatCurrency(a.amount, currency)}</span>
                            </div>
                          ))}
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0', fontSize: 13 }}>
                            <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>Unallocated</span>
                            <span className="font-num" style={{ fontWeight: 700, color: unallocated >= 0 ? 'var(--green)' : 'var(--red)' }}>{formatCurrency(unallocated, currency)}</span>
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => updateIncomePlan({ ...p, is_received: !p.is_received })} style={{ flex: 1, padding: '8px', background: p.is_received ? 'var(--green-dim)' : 'var(--card-2)', border: `1px solid ${p.is_received ? 'var(--green)' : 'var(--border)'}`, borderRadius: 8, color: p.is_received ? 'var(--green)' : 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit', fontWeight: 600 }}>
                          {p.is_received ? '✓ Received' : 'Mark Received'}
                        </button>
                        <button onClick={() => setEditPlan(p)} style={{ padding: '8px 14px', background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit' }}>✏️</button>
                        <button onClick={() => removeIncomePlan(p.id)} style={{ padding: '8px 14px', background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: 'var(--red)', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit', opacity: 0.7 }}>🗑</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <button className="btn-ghost" style={{ marginTop: 16, marginBottom: 20 }} onClick={() => setShowPlanForm(true)}>+ Plan Income</button>
          </div>
        )}

        {/* ── LOANS ─────────────────────────────────────────────────────── */}
        {tab === 'loans' && (
          <div style={{ padding: '0 20px' }}>
            {/* Summary */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <div className="card-2" style={{ flex: 1, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>I OWE</div>
                <div className="font-num" style={{ fontSize: 16, fontWeight: 700, color: 'var(--red)' }}>{formatShort(totalBorrowed, currency)}</div>
              </div>
              <div className="card-2" style={{ flex: 1, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>OWED TO ME</div>
                <div className="font-num" style={{ fontSize: 16, fontWeight: 700, color: 'var(--green)' }}>{formatShort(totalLent, currency)}</div>
              </div>
            </div>

            {activeLoans.length === 0 ? (
              <div className="empty-state">
                <div className="icon">🤝</div>
                <h3>No active loans</h3>
                <p>Track money you owe or are owed</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {activeLoans.map((l) => {
                  const days = l.due_date ? getDaysUntil(l.due_date) : null;
                  const overdue = isOverdue(l.due_date);
                  const pct = l.amount > 0 ? Math.min(100, (1 - ((l.remaining || l.amount) / l.amount)) * 100) : 0;
                  return (
                    <div key={l.id} className="card" style={{ padding: '16px', borderColor: overdue ? 'rgba(239,68,68,0.3)' : undefined }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                        <div style={{ fontSize: 28 }}>{l.type === 'borrowed' ? '📤' : '📥'}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 15, fontWeight: 700 }}>{l.contact_name}</div>
                          <div style={{ fontSize: 12, color: l.type === 'borrowed' ? 'var(--red)' : 'var(--green)', fontWeight: 600, marginTop: 2 }}>
                            {l.type === 'borrowed' ? 'You borrowed' : 'They owe you'}
                          </div>
                          {l.notes && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{l.notes}</div>}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className="font-num" style={{ fontSize: 18, fontWeight: 700, color: l.type === 'borrowed' ? 'var(--red)' : 'var(--green)' }}>
                            {formatShort(l.remaining || l.amount, currency)}
                          </div>
                          {l.due_date && (
                            <div style={{ fontSize: 11, color: overdue ? 'var(--red)' : 'var(--text-3)', marginTop: 2 }}>
                              {overdue ? `⚠ ${Math.abs(days)}d overdue` : days === 0 ? '⚡ Due today' : `Due in ${days}d`}
                            </div>
                          )}
                        </div>
                      </div>
                      {l.amount !== l.remaining && (
                        <>
                          <div className="progress-bar" style={{ marginBottom: 6 }}>
                            <div className="progress-fill" style={{ width: `${pct}%`, background: 'var(--green)' }} />
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
                            {formatShort(l.amount - (l.remaining || l.amount), currency)} repaid of {formatShort(l.amount, currency)}
                          </div>
                        </>
                      )}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => updateLoan({ ...l, status: 'settled' })} style={{ flex: 1, padding: '8px', background: 'var(--green-dim)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, color: 'var(--green)', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit', fontWeight: 600 }}>✓ Mark Settled</button>
                        <button onClick={() => setEditLoan(l)} style={{ padding: '8px 14px', background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit' }}>✏️</button>
                        <button onClick={() => removeLoan(l.id)} style={{ padding: '8px 14px', background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: 'var(--red)', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit', opacity: 0.7 }}>🗑</button>
                      </div>
                    </div>
                  );
                })}

                {/* Settled loans */}
                {loans.filter((l) => l.status === 'settled').length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '8px', opacity: 0.7 }}>
                    {loans.filter((l) => l.status === 'settled').length} settled loan(s) hidden
                  </div>
                )}
              </div>
            )}
            <button className="btn-ghost" style={{ marginTop: 16, marginBottom: 20 }} onClick={() => setShowLoanForm(true)}>+ Record Loan</button>
          </div>
        )}
      </div>

      {(showBudgetForm || editBudget) && <BudgetForm initial={editBudget} onSave={async (d) => { editBudget ? await updateBudget(d) : await addBudget(d); setShowBudgetForm(false); setEditBudget(null); }} onClose={() => { setShowBudgetForm(false); setEditBudget(null); }} />}
      {(showLoanForm || editLoan) && <LoanForm initial={editLoan} onSave={async (d) => { editLoan ? await updateLoan(d) : await addLoan(d); setShowLoanForm(false); setEditLoan(null); }} onClose={() => { setShowLoanForm(false); setEditLoan(null); }} />}
      {(showPlanForm || editPlan) && <IncomePlanForm initial={editPlan} onSave={async (d) => { editPlan ? await updateIncomePlan(d) : await addIncomePlan(d); setShowPlanForm(false); setEditPlan(null); }} onClose={() => { setShowPlanForm(false); setEditPlan(null); }} />}
      {showTxn && <TransactionModal onClose={() => setShowTxn(false)} />}
    </Layout>
  );
}
