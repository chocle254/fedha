import { Fragment, useEffect, useState } from 'react';
import { GROWTH_TIERS } from '../../lib/trading-core';
import { fmtUsd } from './util';

// Growth challenge: grow a small balance (from about $7, i.e. KES 1,000) on paper with real broker rules
// (0.01-lot minimum, 1:1000 margin). Risk per trade steps down as the balance climbs, and only trusted channels
// trade while it is tiny. The same stages apply to MT5 accounts (lib/broker.js) when they are connected.
export default function GrowthCard() {
  const [data, setData] = useState(null);
  const [start, setStart] = useState('7');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => fetch('/api/trading/brokers').then((r) => r.json()).then(setData).catch(() => setData({ error: true }));
  useEffect(() => { load(); }, []);

  const save = async (growth) => {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/trading/brokers', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ growth }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not save.');
      setData(j);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  if (!data || data.error) return null;
  const g = data.growth;
  const on = !!data.settings?.growth?.on;
  const t = g?.tier;
  const progress = t?.next ? Math.min(100, Math.max(0, ((g.equity - (GROWTH_TIERS[t.index - 1]?.upTo || 0)) / (t.next - (GROWTH_TIERS[t.index - 1]?.upTo || 0))) * 100)) : 100;

  return (
    <div className="tx-set-row" style={{ display: 'block' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1 }}><b>🌱 Growth challenge</b><span>Grow a small account with real broker rules: 0.01-lot minimum, 1:1000 margin. Bigger risk while tiny, stepping down as it grows; extra balance becomes bigger lots.</span></div>
        <button className={`tx-switch ${on ? 'on' : ''}`} disabled={busy} onClick={() => save(on ? { on: false } : { on: true, start: Number(start) || 7 })} aria-label="Growth challenge"><i /></button>
      </div>
      {!on && (
        <label className="tx-field" style={{ marginTop: 8 }}><span>Start with</span><input className="font-num" inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)} /><em>USD (KES 1,000 ≈ $7.7)</em></label>
      )}
      {on && g && t && (
        <div className="font-num" style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.6 }}>
          <div><b style={{ fontSize: 16 }}>{fmtUsd(g.equity, false)}</b> <span style={{ color: 'var(--text-3)' }}>from {fmtUsd(g.start, false)} · {g.trades} trades · free margin {fmtUsd(g.free, false)}</span></div>
          <div style={{ margin: '6px 0', height: 6, borderRadius: 3, background: 'rgba(132,142,156,.2)' }}><div style={{ width: `${progress}%`, height: '100%', borderRadius: 3, background: '#22C55E' }} /></div>
          <div><b>{t.label} stage</b>{t.next ? ` · next: ${t.nextLabel} at ${fmtUsd(t.next, false)}` : ' · full size: normal risk rules'}</div>
          <div style={{ color: 'var(--text-2)' }}>
            Risk {t.pct}% a trade (× the channel&apos;s lot multiplier), smallest lot may risk up to {t.cap}% ({fmtUsd((g.equity * t.cap) / 100, false)}){t.minConf ? `, only channels ${t.minConf}%+ confident` : ''}.
            {g.typicalStop ? ` Gold now fits stops up to $${((g.equity * t.cap) / 100).toFixed(2)} (channels' typical stop $${g.typicalStop.toFixed(2)}); forex pairs fit far more easily.` : ''}
          </div>
          <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr', gap: '2px 10px', color: 'var(--text-3)', fontSize: 11.5 }}>
            <b>Stage</b><b>Balance</b><b>Risk / cap</b><b>Channels</b>
            {GROWTH_TIERS.map((x, i) => (
              <Fragment key={x.label}>
                <span style={{ color: i === t.index ? '#22C55E' : undefined }}>{x.label}</span>
                <span>{i ? `$${GROWTH_TIERS[i - 1].upTo}` : '$0'}{x.upTo === Infinity ? '+' : `–${x.upTo}`}</span>
                <span>{x.pct == null ? 'normal' : `${x.pct}% / ${x.cap}%`}</span>
                <span>{x.minConf ? `${x.minConf}%+` : 'all'}</span>
              </Fragment>
            ))}
          </div>
          <button type="button" className="tx-link" disabled={busy} onClick={() => { if (window.confirm('Restart the challenge from a fresh balance? Past trades stay in the channel report cards.')) save({ on: true, restart: true, start: Number(start) || 7 }); }}>↻ Restart from ${start}</button>
        </div>
      )}
      {err && <div style={{ color: '#EF4444', fontSize: 12.5, marginTop: 6 }}>{err}</div>}
    </div>
  );
}
