import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatShort, formatCurrency } from '../lib/utils';
import {
  CHALLENGE_TEMPLATES, getTemplate, challengeTarget, challengeSaved, nextPeriodIndex,
} from '../lib/challenges';

function daysAgoKey(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

// For the auto "no-spend" challenge, derive completed days from transactions.
function autoCompleted(template, transactions, startDate) {
  const completed = [];
  for (let i = 0; i < template.periods; i++) {
    const key = daysAgoKey(template.periods - 1 - i);
    if (key < startDate) continue;
    if (key > daysAgoKey(0)) break;
    const spent = transactions.some((t) => t.date === key && t.type === 'expense');
    if (!spent && key <= daysAgoKey(0)) completed.push(i);
  }
  return completed;
}

export default function SavingsChallenges() {
  const { challenges, addChallenge, updateChallenge, removeChallenge, currency, transactions } = useApp();
  const [picking, setPicking] = useState(false);
  const [detail, setDetail] = useState(null); // challenge id
  const [stepFor, setStepFor] = useState({});

  const activeIds = new Set(challenges.map((c) => c.template_id));

  function join(template) {
    const step = Number(stepFor[template.id] ?? template.defaultStep);
    addChallenge({
      template_id: template.id,
      name: template.name,
      emoji: template.emoji,
      step,
    });
    setPicking(false);
  }

  function markNext(challenge) {
    const tpl = getTemplate(challenge.template_id);
    const idx = nextPeriodIndex(tpl, challenge.completed);
    if (idx === -1) return;
    updateChallenge({ ...challenge, completed: [...challenge.completed, idx].sort((a, b) => a - b) });
  }

  function toggleCell(challenge, idx) {
    const done = new Set(challenge.completed);
    if (done.has(idx)) done.delete(idx);
    else done.add(idx);
    updateChallenge({ ...challenge, completed: [...done].sort((a, b) => a - b) });
  }

  const detailChallenge = challenges.find((c) => c.id === detail);

  return (
    <div className="section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>Savings Challenges</div>
        {challenges.length > 0 && (
          <button onClick={() => setPicking(true)} style={{ background: 'none', border: 'none', color: 'var(--green)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            + New
          </button>
        )}
      </div>

      {challenges.length === 0 ? (
        <div className="card" style={{ padding: '22px 18px', textAlign: 'center' }}>
          <div style={{ fontSize: 34, marginBottom: 8 }}>🏆</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Turn saving into a game</div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16, lineHeight: 1.5 }}>
            Join a challenge like the 52-week or 100-envelope and watch your stash grow week by week.
          </div>
          <button className="btn-primary" style={{ width: '100%' }} onClick={() => setPicking(true)}>Browse challenges</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {challenges.map((c) => {
            const tpl = getTemplate(c.template_id);
            if (!tpl) return null;
            const completed = tpl.auto ? autoCompleted(tpl, transactions, c.start_date) : c.completed;
            const target = challengeTarget(tpl, c.step);
            const saved = challengeSaved(tpl, c.step, completed);
            const pct = target > 0 ? Math.min(100, (saved / target) * 100) : (completed.length / tpl.periods) * 100;
            const idx = nextPeriodIndex(tpl, completed);
            const done = idx === -1;
            return (
              <div key={c.id} className="card" style={{ padding: '16px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 26 }}>{c.emoji}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                      {completed.length} / {tpl.periods} {tpl.periodLabel}s done
                    </div>
                  </div>
                  <button onClick={() => removeChallenge(c.id)} className="btn-icon" aria-label="Leave challenge" style={{ width: 30, height: 30 }}>✕</button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <span className="font-num" style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)' }}>{formatShort(saved, currency)}</span>
                  {target > 0 && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>of {formatShort(target, currency)}</span>}
                </div>
                <div className="progress-bar" style={{ height: 8, marginBottom: 14 }}>
                  <div className="progress-fill" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #10B98199, #10B981)' }} />
                </div>

                {tpl.auto ? (
                  <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
                    {done ? '🎉 Challenge complete!' : 'Tracked automatically — just avoid logging expenses.'}
                  </div>
                ) : done ? (
                  <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--green)' }}>🎉 Challenge complete — well done!</div>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-primary" style={{ flex: 1 }} onClick={() => markNext(c)}>
                      Save {formatCurrency(tpl.amountFor(idx, c.step), currency)}
                    </button>
                    <button className="btn-ghost" style={{ padding: '0 16px' }} onClick={() => setDetail(c.id)}>Grid</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Browse / join modal */}
      {picking && (
        <div className="modal-overlay" onClick={() => setPicking(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>Choose a challenge</div>
              <button className="btn-icon" aria-label="Close" onClick={() => setPicking(false)}>✕</button>
            </div>
            <div className="modal-body">
              {CHALLENGE_TEMPLATES.map((t) => {
                const step = Number(stepFor[t.id] ?? t.defaultStep);
                const target = challengeTarget(t, step);
                const joined = activeIds.has(t.id);
                return (
                  <div key={t.id} className="card-2" style={{ padding: 14, borderRadius: 14, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <div style={{ fontSize: 24 }}>{t.emoji}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{t.periods} {t.periodLabel}s{target > 0 ? ` · target ${formatShort(target, currency)}` : ' · auto-tracked'}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 12 }}>{t.blurb}</div>
                    {!t.auto && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <span style={{ fontSize: 12, color: 'var(--text-3)', flex: 1 }}>{t.stepLabel}</span>
                        <input
                          className="input"
                          type="number"
                          inputMode="numeric"
                          value={stepFor[t.id] ?? t.defaultStep}
                          onChange={(e) => setStepFor((p) => ({ ...p, [t.id]: e.target.value }))}
                          style={{ width: 110, padding: '8px 10px', fontSize: 14 }}
                        />
                      </div>
                    )}
                    <button
                      className="btn-primary"
                      style={{ width: '100%', opacity: joined ? 0.5 : 1 }}
                      disabled={joined}
                      onClick={() => join(t)}
                    >
                      {joined ? 'Already active' : 'Start challenge'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Period grid modal */}
      {detailChallenge && (() => {
        const tpl = getTemplate(detailChallenge.template_id);
        const done = new Set(detailChallenge.completed);
        return (
          <div className="modal-overlay" onClick={() => setDetail(null)}>
            <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{detailChallenge.emoji} {detailChallenge.name}</div>
                <button className="btn-icon" aria-label="Close" onClick={() => setDetail(null)}>✕</button>
              </div>
              <div className="modal-body">
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>
                  Tap a {tpl.periodLabel} to mark it saved. Each cell shows the amount for that {tpl.periodLabel}.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                  {Array.from({ length: tpl.periods }).map((_, i) => {
                    const isDone = done.has(i);
                    return (
                      <button
                        key={i}
                        onClick={() => toggleCell(detailChallenge, i)}
                        style={{
                          aspectRatio: '1', borderRadius: 10, cursor: 'pointer',
                          border: `1px solid ${isDone ? 'var(--green)' : 'var(--border)'}`,
                          background: isDone ? 'var(--green-dim, rgba(16,185,129,0.15))' : 'var(--card-2)',
                          color: isDone ? 'var(--green)' : 'var(--text-2)',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          fontFamily: 'inherit', padding: 2,
                        }}
                      >
                        <span style={{ fontSize: 10, opacity: 0.7 }}>{tpl.periodLabel.charAt(0).toUpperCase()}{i + 1}</span>
                        <span style={{ fontSize: 11, fontWeight: 700 }}>{formatShort(tpl.amountFor(i, detailChallenge.step), currency)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
