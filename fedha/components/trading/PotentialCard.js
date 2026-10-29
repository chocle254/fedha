import { useMemo } from 'react';
import { potentialReport } from '../../lib/trading-potential';
import { fmtUsd } from './util';

// Trading → Signals: what the channels' closed trades would have made on your paper balance at your risk %,
// following everything vs only the winners, how long $10k would take at that pace, and the go-real checklist.
// Built from R (profit ÷ each trade's own risk), so it is the same whatever the lot sizes were. lib/trading-potential.js
const GOAL = 10000;
const rTxt = (r) => `${r >= 0 ? '+' : ''}${r.toFixed(2)}R`;
const daysTxt = (d) => (d == null ? '—' : d > 365 * 3 ? '3+ years' : d > 60 ? `${Math.round(d / 30)} months` : `${d} days`);

function Replay({ title, sub, r, start }) {
  const up = r.end >= start;
  return (
    <div style={{ flex: 1, minWidth: 140, padding: 12, borderRadius: 10, background: 'rgba(132,142,156,.08)' }}>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{title}</div>
      <div className="font-num" style={{ fontSize: 20, fontWeight: 800, marginTop: 2, color: r.bust ? '#EF4444' : up ? '#22C55E' : '#EF4444' }}>{r.bust ? 'Blown' : fmtUsd(r.end, false)}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{sub} · worst drop {r.maxDd}%</div>
      <div style={{ fontSize: 11.5, marginTop: 4 }}>{r.days != null ? `$${GOAL.toLocaleString()} in ~${daysTxt(r.days)}` : up ? 'Not enough trades to project' : `Shrinking: never reaches $${GOAL.toLocaleString()} at this pace`}</div>
    </div>
  );
}

export default function PotentialCard({ trades, settings }) {
  const start = Number(settings?.paper_balance) || 1000;
  const riskPct = settings?.risk_mode === 'fixed' ? ((Number(settings?.risk_usdt) || 10) / start) * 100 : Number(settings?.risk_pct) || 1;
  const p = useMemo(() => potentialReport(trades, { start, riskPct, goal: GOAL }), [trades, start, riskPct]);
  if (!p) return null;
  const top = p.channels.filter((c) => c.avgR > 0).slice(0, 5);
  const worst = p.channels.filter((c) => c.avgR < 0).slice(-3).reverse();

  return (
    <div className="tx-board">
      <div className="tx-sub">Potential: what the channels would make</div>
      <div className="tx-row-note" style={{ padding: '0 14px 10px' }}>
        {p.trades} closed trades over {p.spanDays} day{p.spanDays === 1 ? '' : 's'}, replayed in order on {fmtUsd(start, false)} risking {+riskPct.toFixed(1)}% of the balance each trade. All signals average {rTxt(p.avgAll)} a trade.
        {p.trades < 30 ? ' Early read: most channels have only a handful of trades, so this will move a lot.' : ''}
      </div>
      <div style={{ display: 'flex', gap: 10, padding: '0 14px 12px', flexWrap: 'wrap' }}>
        <Replay title="Following every signal" sub={`${p.trades} trades`} r={p.all} start={start} />
        {p.best.n > 0
          ? <Replay title={`Only the winners (${p.winners.length})`} sub={`${p.best.n} trades`} r={p.best} start={start} />
          : <div style={{ flex: 1, minWidth: 140, padding: 12, borderRadius: 10, background: 'rgba(132,142,156,.08)', fontSize: 12, color: 'var(--text-3)' }}>No channel is winning over 3+ trades yet.</div>}
      </div>
      {top.length > 0 && (
        <div style={{ padding: '0 14px 8px' }}>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 4 }}>Making money · roughly per week at your risk</div>
          {top.map((c) => (
            <div key={c.source} className="font-num" style={{ display: 'flex', gap: 8, fontSize: 12.5, padding: '3px 0' }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.source}</span>
              <span style={{ color: 'var(--text-3)' }}>{c.n} trades · {c.winRate}% won · {rTxt(c.avgR)}</span>
              <b style={{ color: '#22C55E', minWidth: 70, textAlign: 'right' }}>+{fmtUsd(c.weekly, false)}/wk</b>
            </div>
          ))}
        </div>
      )}
      {worst.length > 0 && (
        <div style={{ padding: '0 14px 10px' }}>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 4 }}>Costing you</div>
          {worst.map((c) => (
            <div key={c.source} className="font-num" style={{ display: 'flex', gap: 8, fontSize: 12.5, padding: '3px 0' }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.source}</span>
              <span style={{ color: 'var(--text-3)' }}>{c.n} trades · {c.winRate}% won · {rTxt(c.avgR)}</span>
              <b style={{ color: '#EF4444', minWidth: 70, textAlign: 'right' }}>{fmtUsd(c.weekly, false)}/wk</b>
            </div>
          ))}
        </div>
      )}
      <div style={{ padding: '4px 14px 14px' }}>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 4 }}>Ready for real money? {p.ready ? '✅ yes' : `${p.checks.filter((c) => c.ok).length}/${p.checks.length}`}</div>
        {p.checks.map((c) => <div key={c.text} style={{ fontSize: 12.5, padding: '2px 0', color: c.ok ? '#22C55E' : 'var(--text-2)' }}>{c.ok ? '✓' : '○'} {c.text}</div>)}
      </div>
    </div>
  );
}
