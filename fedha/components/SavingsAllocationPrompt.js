import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, distributeContribution } from '../lib/utils';

export default function SavingsAllocationPrompt({ depositAmount, onConfirm, onSkip }) {
  const { goals, currency, savingsPlanDays } = useApp();
  const activeGoals = useMemo(() => goals.filter((g) => (g.current || 0) < g.target), [goals]);
  const totalRemaining = activeGoals.reduce((s, g) => s + (g.target - (g.current || 0)), 0);
  const maxCut = Math.max(0, Math.min(depositAmount, totalRemaining));

  const suggested = useMemo(() => {
    let base = depositAmount * 0.2; // default: suggest 20% of what just came in
    if (savingsPlanDays && totalRemaining > 0) base = totalRemaining / savingsPlanDays; // or the daily plan target
    return Math.min(maxCut, Math.max(1, Math.round(base)));
  }, [depositAmount, savingsPlanDays, totalRemaining, maxCut]);

  const [amount, setAmount] = useState(suggested);
  const safeAmount = Math.min(Math.max(0, Number(amount) || 0), maxCut);
  const allocations = distributeContribution(activeGoals, safeAmount).filter((a) => a.allocated > 0);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onSkip()}>
      <div className="modal-sheet">
        <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '12px auto' }} />
        <div className="modal-header">
          <span style={{ fontSize: 16, fontWeight: 700 }}>🏦 Set some aside?</span>
          <button className="btn-icon" onClick={onSkip}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 13, color: 'var(--text-2)', textAlign: 'center', lineHeight: 1.5 }}>
            You just added <span className="font-num" style={{ color: 'var(--green)', fontWeight: 700 }}>{formatCurrency(depositAmount, currency)}</span> to your wallet.
            Want to cut a portion for your {activeGoals.length} savings goal{activeGoals.length !== 1 ? 's' : ''}?
          </div>

          <div>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Amount to Set Aside</label>
            <input
              className="input font-num"
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ fontSize: 22, fontWeight: 600 }}
              autoFocus
            />
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>Up to {formatCurrency(maxCut, currency)} of this deposit</div>
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

          <button className="btn-primary" disabled={safeAmount <= 0} onClick={() => onConfirm(safeAmount, allocations)}>
            Set Aside {formatCurrency(safeAmount, currency)}
          </button>
          <button className="btn-ghost" onClick={onSkip}>Skip — keep it all in wallet</button>
        </div>
      </div>
    </div>
  );
}
