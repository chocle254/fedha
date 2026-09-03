import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatShort, computeSavingsBreakdown, SAVINGS_PLAN_PRESETS } from '../lib/utils';

export default function SavingsPlanCard({ remaining }) {
  const { currency, savingsPlanDays, setSavingsPlanDays } = useApp();
  const [showCustom, setShowCustom] = useState(false);
  const [customDays, setCustomDays] = useState('');

  if (remaining <= 0) return null;

  const breakdown = savingsPlanDays ? computeSavingsBreakdown(remaining, savingsPlanDays) : null;

  function choosePreset(days) {
    setShowCustom(false);
    setSavingsPlanDays(days);
  }

  function applyCustom() {
    const d = Math.round(Number(customDays));
    if (d > 0) { setSavingsPlanDays(d); setShowCustom(false); setCustomDays(''); }
  }

  return (
    <div className="card" style={{ padding: '16px', marginTop: 12, borderColor: 'rgba(16,185,129,0.2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 18 }}>📊</span>
        <span style={{ fontSize: 14, fontWeight: 700 }}>Savings Plan</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12, lineHeight: 1.5 }}>
        You need <span className="font-num" style={{ color: 'var(--green)', fontWeight: 700 }}>{formatCurrency(remaining, currency)}</span> more to hit every goal. Pick a timeframe to see the breakdown:
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: showCustom || breakdown ? 14 : 0 }}>
        {SAVINGS_PLAN_PRESETS.map((p) => (
          <button key={p.days} className={`chip ${savingsPlanDays === p.days ? 'active' : ''}`} onClick={() => choosePreset(p.days)}>
            {p.label}
          </button>
        ))}
        <button className={`chip ${showCustom ? 'active' : ''}`} onClick={() => setShowCustom((s) => !s)}>Custom</button>
      </div>

      {showCustom && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input
            className="input font-num"
            type="number"
            inputMode="numeric"
            placeholder="Number of days"
            value={customDays}
            onChange={(e) => setCustomDays(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn-primary" style={{ width: 'auto', padding: '0 18px' }} onClick={applyCustom}>Set</button>
        </div>
      )}

      {breakdown && (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['Daily', breakdown.daily], ['Weekly', breakdown.weekly], ['Monthly', breakdown.monthly]].map(([label, val]) => (
              <div key={label} style={{ flex: 1, background: 'var(--card-2)', borderRadius: 12, padding: '10px 8px', textAlign: 'center', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                <div className="font-num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>{formatShort(val, currency)}</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-3)', marginTop: 10 }}>
            Over {breakdown.days} days · we&apos;ll suggest this amount whenever you add money to a wallet
          </div>
        </>
      )}
    </div>
  );
}
