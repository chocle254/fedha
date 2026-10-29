import { Fragment, useEffect, useState } from 'react';
import { GROWTH_TIERS } from '../../lib/trading-core';
import { fmtUsd, base } from './util';

// Growth account: a second paper account (from KES 1,000) that takes the same signals as the main account but
// only when its balance and stage support them, with real broker rules (0.01-lot minimum, 1:1000 margin).
// The main account keeps trading every signal so every channel is measured. At the target ($100) Luxe says
// it is time for the real account. Server side: growthEnter / growthMilestone in lib/trading.js.
export default function GrowthCard() {
  const [data, setData] = useState(null);
  const [kes, setKes] = useState('1000');
  const [target, setTarget] = useState('100');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => fetch('/api/trading/brokers').then((r) => r.json()).then((j) => { setData(j); if (j.settings?.growth?.target) setTarget(String(j.settings.growth.target)); }).catch(() => setData({ error: true }));
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
  const fresh = () => ({ on: true, restart: true, start_kes: Number(kes) || 1000, target: Number(target) || 100 });

  if (!data || data.error) return null;
  const g = data.growth;
  const saved = data.settings?.growth;
  const on = !!saved?.on;
  const t = g?.tier;
  const tgt = Number(saved?.target) || 100;
  const progress = g ? Math.min(100, Math.max(0, ((g.equity - g.start) / (tgt - g.start)) * 100)) : 0;

  return (
    <div className="tx-set-row" style={{ display: 'block' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1 }}><b>🌱 Growth account</b><span>A second paper account from KES 1,000. The main account still trades every signal to measure every channel; this one takes the same signals only when its balance supports the lot (0.01-lot minimum, 1:1000 margin), risking more while tiny and less as it grows.</span></div>
        <button className={`tx-switch ${on ? 'on' : ''}`} disabled={busy} onClick={() => save(on ? { on: false } : saved?.since ? { on: true } : fresh())} aria-label="Growth account"><i /></button>
      </div>
      {!saved?.since && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <label className="tx-field" style={{ flex: 1 }}><span>Start with</span><input className="font-num" inputMode="decimal" value={kes} onChange={(e) => setKes(e.target.value)} /><em>KES</em></label>
          <label className="tx-field" style={{ flex: 1 }}><span>Go real at</span><input className="font-num" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /><em>USD</em></label>
        </div>
      )}
      {on && g && t && (
        <div className="font-num" style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.6 }}>
          <div><b style={{ fontSize: 16, color: g.equity >= g.start ? '#22C55E' : '#EF4444' }}>{fmtUsd(g.equity, false)}</b> <span style={{ color: 'var(--text-3)' }}>from {fmtUsd(g.start, false)}{saved.start_kes ? ` (KES ${Number(saved.start_kes).toLocaleString()})` : ''} · goal {fmtUsd(tgt, false)}</span></div>
          <div style={{ margin: '6px 0', height: 6, borderRadius: 3, background: 'rgba(132,142,156,.2)' }}><div style={{ width: `${progress}%`, height: '100%', borderRadius: 3, background: '#22C55E' }} /></div>
          <div>{g.trades} trades · {g.wins} won · {g.losses} lost · {g.open} open · free margin {fmtUsd(g.free, false)}</div>
          <div><b>{t.label} stage</b>{t.next ? ` · ${t.nextLabel} at ${fmtUsd(t.next, false)}` : ''}: risk {t.pct}% a trade, smallest lot may risk up to {t.cap}% ({fmtUsd((g.equity * t.cap) / 100, false)}){t.minConf ? `, channels ${t.minConf}%+ confident` : ', every channel'}.</div>
          {g.typicalStop ? <div style={{ color: 'var(--text-3)' }}>Gold fits stops up to ${((g.equity * t.cap) / 100).toFixed(2)} now (channels&apos; typical ${g.typicalStop.toFixed(2)}); forex fits far sooner.</div> : null}
          {g.recent?.length > 0 && (
            <div style={{ marginTop: 6, display: 'grid', gap: 2 }}>
              {g.recent.map((x) => (
                <div key={x.id} style={{ display: 'flex', gap: 8 }}>
                  <span style={{ width: 70 }}>{x.side === 'BUY' ? 'Long' : 'Short'} {base(x.symbol)}</span>
                  <span style={{ flex: 1, color: 'var(--text-3)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{x.source}</span>
                  <span style={{ color: x.status === 'open' || x.status === 'pending' ? 'var(--text-2)' : x.pnl >= 0 ? '#22C55E' : '#EF4444' }}>{x.status === 'open' || x.status === 'pending' ? `${x.status} · risk ${fmtUsd(x.risk, false)}` : fmtUsd(x.pnl)}</span>
                </div>
              ))}
            </div>
          )}
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
          <button type="button" className="tx-link" disabled={busy} onClick={() => { if (window.confirm(`Restart the growth account from KES ${kes}? The main account and channel report cards are not affected.`)) save(fresh()); }}>↻ Restart from KES {kes}</button>
        </div>
      )}
      {err && <div style={{ color: '#EF4444', fontSize: 12.5, marginTop: 6 }}>{err}</div>}
    </div>
  );
}
