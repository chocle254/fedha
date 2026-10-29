import { useState } from 'react';
import Layout from '../components/Layout';
import TransactionModal from '../components/TransactionModal';
import SavingsPlanCard from '../components/SavingsPlanCard';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatShort, formatDate, getDaysUntil, genId } from '../lib/utils';
import { summarize } from '../lib/earnings';

const GOAL_ICONS = ['🎯','🏠','🚗','✈️','💻','📱','💍','🎓','👶','🏋️','🌍','💰','🏦','🎁','🛥️','🎮'];
const GOAL_COLORS = ['#10B981','#3B82F6','#F59E0B','#EF4444','#8B5CF6','#EC4899','#06B6D4','#F97316'];

function GoalForm({ initial, onSave, onClose }) {
  const [name, setName] = useState(initial?.name || '');
  const [target, setTarget] = useState(initial?.target || '');
  const [current, setCurrent] = useState(initial?.current ?? 0);
  const [deadline, setDeadline] = useState(initial?.deadline || '');
  const [icon, setIcon] = useState(initial?.icon || '🎯');
  const [color, setColor] = useState(initial?.color || '#10B981');
  const [cutPct, setCutPct] = useState(initial?.cut_pct ?? 30);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '12px auto' }} />
        <div className="modal-header">
          <span style={{ fontSize: 16, fontWeight: 700 }}>{initial ? 'Edit Goal' : 'New Savings Goal'}</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Icon</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {GOAL_ICONS.map((ic) => (
                <button key={ic} onClick={() => setIcon(ic)}
                  style={{ fontSize: 22, width: 42, height: 42, borderRadius: 10, border: `2px solid ${icon === ic ? 'var(--green)' : 'var(--border)'}`, background: icon === ic ? 'var(--green-dim)' : 'var(--card-2)', cursor: 'pointer' }}>
                  {ic}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Goal Name</label>
            <input className="input" placeholder="e.g. Buy a Laptop" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Target Amount</label>
              <input className="input font-num" type="number" inputMode="decimal" placeholder="0.00" value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Saved So Far</label>
              <input className="input font-num" type="number" inputMode="decimal" placeholder="0.00" value={current} onChange={(e) => setCurrent(e.target.value)} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Target Date (optional)</label>
            <input className="input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Save from each deposit: {cutPct}%</label>
            <input type="range" min="10" max="90" step="5" value={cutPct} onChange={(e) => setCutPct(Number(e.target.value))} style={{ width: '100%' }} />
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>When it's this goal's turn, the savings question suggests this much of the deposit (you still confirm every time).</div>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Colour</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {GOAL_COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)} style={{ width: 32, height: 32, borderRadius: 8, background: c, border: `3px solid ${color === c ? '#fff' : 'transparent'}`, cursor: 'pointer', transform: color === c ? 'scale(1.2)' : 'none', transition: 'transform 0.1s' }} />
              ))}
            </div>
          </div>
          <button className="btn-primary" disabled={!name || !target} onClick={() => onSave({ ...initial, name, target: Number(target), current: Number(current), deadline: deadline || null, icon, color, cut_pct: Number(cutPct) || 30, id: initial?.id || genId(), created_at: initial?.created_at || new Date().toISOString() })}>
            {initial ? 'Save Changes' : 'Create Goal'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ContributeModal({ goal, onSave, onClose }) {
  const [amount, setAmount] = useState('');
  const { currency } = useApp();
  const remaining = goal.target - (goal.current || 0);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '12px auto' }} />
        <div className="modal-header">
          <span style={{ fontSize: 16, fontWeight: 700 }}>{goal.icon} Add to {goal.name}</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 4 }}>Still need</div>
            <div className="font-num" style={{ fontSize: 28, fontWeight: 700, color: goal.color }}>{formatCurrency(remaining, currency)}</div>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Amount to Add</label>
            <input className="input font-num" type="number" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus style={{ fontSize: 22, fontWeight: 600 }} />
          </div>
          <button className="btn-primary" disabled={!amount || Number(amount) <= 0} onClick={() => onSave(Number(amount))}>
            Add {amount ? formatCurrency(amount, currency) : 'Amount'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GoalsPage() {
  const { goals, addGoal, updateGoal, removeGoal, currency } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editGoal, setEditGoal] = useState(null);
  const [contributeGoal, setContributeGoal] = useState(null);
  const [showTxn, setShowTxn] = useState(false);

  const { savingsWaiting = [], confirmLockByHand, cancelWaitingSave, transactions, wallets } = useApp();
  // Pace: what comes in per week (last 2 weeks of earned income, lib/earnings.js) × the goal's save %.
  const earn = summarize(transactions || []);
  const weeklyIn = earn.days14.reduce((s2, d) => s2 + d.amount, 0) / 2;
  const activeGoals = goals.filter((g) => (g.current || 0) < g.target);
  const completedGoals = goals.filter((g) => (g.current || 0) >= g.target);
  const totalTarget = goals.reduce((s, g) => s + g.target, 0);
  const totalSaved = goals.reduce((s, g) => s + (g.current || 0), 0);

  async function handleContribute(goal, amount) {
    await updateGoal({ ...goal, current: (goal.current || 0) + amount });
    setContributeGoal(null);
  }

  return (
    <Layout onFab={() => setShowTxn(true)}>
      <div className="page">
        <div className="page-header">
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Savings Goals</h1>
          {goals.length > 0 && (
            <div className="card-2" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>TOTAL SAVED</div>
                  <div className="font-num" style={{ fontSize: 18, fontWeight: 700, color: 'var(--green)' }}>{formatShort(totalSaved, currency)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>TOTAL TARGET</div>
                  <div className="font-num" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{formatShort(totalTarget, currency)}</div>
                </div>
              </div>
              <div className="progress-bar" style={{ height: 8 }}>
                <div className="progress-fill" style={{ width: `${Math.min(100, (totalSaved / totalTarget) * 100)}%`, background: 'var(--green)' }} />
              </div>
              <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
                {((totalSaved / totalTarget) * 100).toFixed(1)}% of all goals reached
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '0 20px' }}>
          {savingsWaiting.length > 0 && (
            <div className="card" style={{ padding: '14px 16px', marginBottom: 12, borderColor: 'rgba(245,158,11,0.4)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: '#F59E0B' }}>🔒 WAITING FOR THE ZIIDI LOCK</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4, lineHeight: 1.5 }}>Recorded the moment Ziidi's "successfully locked" SMS for this amount arrives.</div>
              {savingsWaiting.map((w) => (
                <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  <div style={{ flex: 1, fontSize: 13 }}>
                    <b className="font-num">{formatCurrency(w.amount, currency)}</b> for {(w.goals || []).map((g) => g.name).join(', ')}
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{(wallets || []).find((x) => x.id === w.wallet_id)?.name || 'M-Pesa'} · since {new Date(w.created_at).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</div>
                  </div>
                  <button className="btn-primary" style={{ width: 'auto', padding: '8px 12px', fontSize: 12.5 }} onClick={() => confirmLockByHand(w)}>I locked it</button>
                  <button className="btn-ghost" style={{ width: 'auto', padding: '8px 10px', fontSize: 12.5 }} onClick={() => cancelWaitingSave(w)}>✕</button>
                </div>
              ))}
            </div>
          )}
          <SavingsPlanCard remaining={totalTarget - totalSaved} />
          {activeGoals.length === 0 && completedGoals.length === 0 ? (
            <div className="empty-state" style={{ paddingTop: 60 }}>
              <div className="icon">🎯</div>
              <h3>No savings goals yet</h3>
              <p>Set a target and track your progress towards it</p>
            </div>
          ) : (
            <>
              {/* Active goals */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {activeGoals.map((g) => {
                  const pct = Math.min(100, ((g.current || 0) / g.target) * 100);
                  const remaining = g.target - (g.current || 0);
                  const days = g.deadline ? getDaysUntil(g.deadline) : null;

                  return (
                    <div key={g.id} className="card" style={{ padding: '18px 16px', borderColor: `${g.color}25` }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
                        <div style={{ width: 48, height: 48, borderRadius: 16, background: `${g.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
                          {g.icon}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 15, fontWeight: 700 }}>{g.name}</div>
                          {days !== null && (
                            <div style={{ fontSize: 12, color: days < 0 ? 'var(--red)' : 'var(--text-3)', marginTop: 2 }}>
                              {days < 0 ? `${Math.abs(days)}d past deadline` : days === 0 ? '⚡ Deadline today!' : `${days} days left`}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className="font-num" style={{ fontSize: 18, fontWeight: 700, color: g.color }}>{formatShort(g.current || 0, currency)}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>of {formatShort(g.target, currency)}</div>
                        </div>
                      </div>

                      {/* Progress */}
                      <div className="progress-bar" style={{ height: 10, marginBottom: 8 }}>
                        <div className="progress-fill" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${g.color}99, ${g.color})` }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>
                        <span>{pct.toFixed(1)}% saved</span>
                        <span>{formatShort(remaining, currency)} to go</span>
                      </div>
                      {(() => {
                        // Honest pace: at the goal's save % of what has come in per week lately, when it gets there.
                        const cut = (Number(g.cut_pct) || 30) / 100;
                        const perWeek = weeklyIn * cut;
                        if (!(perWeek > 0)) return null;
                        const weeks = remaining / perWeek;
                        const eta = new Date(Date.now() + weeks * 7 * 864e5);
                        const onTime = g.deadline ? eta <= new Date(`${g.deadline}T23:59:59`) : null;
                        const needPct = g.deadline && days > 0 ? Math.round((remaining / (days / 7)) / weeklyIn * 100) : null;
                        return (
                          <div style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 14, padding: '8px 10px', borderRadius: 10, background: onTime === false ? 'rgba(245,158,11,0.08)' : 'rgba(16,185,129,0.08)', color: 'var(--text-2)' }}>
                            At {Math.round(cut * 100)}% of ~{formatShort(weeklyIn, currency)}/week coming in: <b>{formatShort(perWeek, currency)}/week</b>, done by <b>{eta.toLocaleDateString([], { day: 'numeric', month: 'short', year: eta.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })}</b>.
                            {onTime === false && needPct != null && <> To make {formatDate ? formatDate(g.deadline) : g.deadline} you'd need to save {needPct > 100 ? 'more than you earn' : `${needPct}% of income`}{needPct > 100 ? ' at this pace' : ''}.</>}
                            {onTime === true && <> On track ✓</>}
                          </div>
                        );
                      })()}

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setContributeGoal(g)} style={{ flex: 2, padding: '10px', background: `${g.color}20`, border: `1px solid ${g.color}40`, borderRadius: 10, color: g.color, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit' }}>
                          + Add Savings
                        </button>
                        <button onClick={() => setEditGoal(g)} style={{ flex: 1, padding: '10px', background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit' }}>✏️</button>
                        <button onClick={() => window.confirm(`Delete goal "${g.name}"? This can't be undone.`) && removeGoal(g.id)} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: 'var(--red)', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit', opacity: 0.7 }}>🗑</button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Completed goals */}
              {completedGoals.length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <div className="section-title">🏆 Completed Goals</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {completedGoals.map((g) => (
                      <div key={g.id} className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, borderColor: 'rgba(16,185,129,0.25)' }}>
                        <div style={{ fontSize: 28 }}>{g.icon}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{g.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 2 }}>🎉 Goal achieved!</div>
                        </div>
                        <div className="font-num" style={{ fontSize: 16, fontWeight: 700, color: 'var(--green)' }}>{formatShort(g.target, currency)}</div>
                        <button onClick={() => window.confirm(`Delete goal "${g.name}"? This can't be undone.`) && removeGoal(g.id)} className="btn-icon" style={{ opacity: 0.5 }}>✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <button className="btn-ghost" style={{ marginTop: 20, marginBottom: 20 }} onClick={() => setShowForm(true)}>
            + New Goal
          </button>
        </div>
      </div>

      {(showForm || editGoal) && (
        <GoalForm
          initial={editGoal}
          onSave={async (d) => { editGoal ? await updateGoal(d) : await addGoal(d); setShowForm(false); setEditGoal(null); }}
          onClose={() => { setShowForm(false); setEditGoal(null); }}
        />
      )}
      {contributeGoal && (
        <ContributeModal goal={contributeGoal} onSave={(amt) => handleContribute(contributeGoal, amt)} onClose={() => setContributeGoal(null)} />
      )}
      {showTxn && <TransactionModal onClose={() => setShowTxn(false)} />}
    </Layout>
  );
}
