import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, goalsInTurnOrder, fillGoalsInOrder, DEPOSIT_SAVINGS_CUT, convertAmount, toBaseAmount } from '../lib/utils';

// Shown after any deposit (from any page, Jarvis, income plans…): asks whether
// to save 30% of it for the goal whose turn it is. Amounts in the input are in
// the display currency; everything stored is in the base currency.
export default function SavingsPrompt() {
  const { pendingSavings: deposit, confirmSavingsCut, skipSavingsCut, goals, currency, lastSavedGoalId } = useApp();
  const queue = useMemo(() => goalsInTurnOrder(goals, lastSavedGoalId), [goals, lastSavedGoalId]);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const depositBase = Number(deposit?.amount) || 0;
  const totalNeeded = queue.reduce((s, g) => s + (g.target - (g.current || 0)), 0);
  const maxBase = Math.max(0, Math.min(depositBase, totalNeeded));

  // Each new deposit starts at 30%.
  useEffect(() => {
    if (!deposit) return;
    const suggested = Math.min(maxBase, depositBase * DEPOSIT_SAVINGS_CUT);
    setAmount(String(Math.round(convertAmount(suggested, currency) * 100) / 100));
  }, [deposit?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!deposit || !queue.length) return null;

  const cutBase = Math.min(Math.max(0, toBaseAmount(Number(amount) || 0, currency)), maxBase);
  const allocations = fillGoalsInOrder(queue, cutBase).filter((a) => a.allocated > 0);
  const turnGoal = queue[0];
  const nextGoal = queue[1];

  async function save() {
    setSaving(true);
    try { await confirmSavingsCut(cutBase); } finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1000 }} onClick={(e) => e.target === e.currentTarget && skipSavingsCut()}>
      <div className="modal-sheet">
        <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '12px auto' }} />
        <div className="modal-header">
          <span style={{ fontSize: 16, fontWeight: 700 }}>🏦 Save 30%?</span>
          <button className="btn-icon" onClick={skipSavingsCut}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 13, color: 'var(--text-2)', textAlign: 'center', lineHeight: 1.5 }}>
            You just added <span className="font-num" style={{ color: 'var(--green)', fontWeight: 700 }}>{formatCurrency(depositBase, currency)}</span>.
            It's <b style={{ color: 'var(--text)' }}>{turnGoal.icon} {turnGoal.name}</b>'s turn.
            {nextGoal && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>Next deposit goes to {nextGoal.icon} {nextGoal.name}</div>}
          </div>

          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Amount to Save</label>
            <input
              className="input font-num"
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ fontSize: 22, fontWeight: 600 }}
            />
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>Up to {formatCurrency(maxBase, currency)}</div>
          </div>

          {allocations.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--card-2)', borderRadius: 10, padding: '10px 12px' }}>
              {allocations.map((a) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span style={{ fontSize: 16 }}>{a.icon}</span>
                  <span style={{ flex: 1, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                  <span className="font-num" style={{ color: a.color, fontWeight: 700 }}>+{formatCurrency(a.allocated, currency)}</span>
                </div>
              ))}
            </div>
          )}

          <button className="btn-primary" disabled={cutBase <= 0 || saving} onClick={save}>
            {saving ? 'Saving…' : `Save ${formatCurrency(cutBase, currency)}`}
          </button>
          <button className="btn-ghost" onClick={skipSavingsCut} disabled={saving}>Skip, keep it all in wallet</button>
        </div>
      </div>
    </div>
  );
}
