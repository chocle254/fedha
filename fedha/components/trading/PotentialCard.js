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
      <div className="font-num" style={{ fontSize: 20, fontWeight: 800, marginTop: 2, color: r.bust ? '#EF4444' : up ? '#22C55E' : '#EF4444' }}>{r.bust ? 'Depleted' : fmtUsd(r.end, false)}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{sub} · max drawdown {r.maxDd}%</div>
      <div style={{ fontSize: 11.5, marginTop: 4 }}>{r.days != null ? `$${GOAL.toLocaleString()} in ~${daysTxt(r.days)}` : up ? 'Insufficient data' : 'Declining'}</div>
    </div>
  );
}

// The Proven book (lib/ladder.js): a paper account that only trades channels AFTER they earned Proven, at the
// same risk as the main account. No hindsight: this is what following only proven channels actually did.
function ProvenBook({ book, provenCount }) {
  const box = { flex: 1, minWidth: 140, padding: 12, borderRadius: 10, background: 'rgba(124,196,255,.08)', border: '1px solid rgba(124,196,255,.25)' };
  if (!provenCount) return <div style={{ ...box, fontSize: 12, color: 'var(--text-3)' }}>Proven book: awaiting its first Proven channel.</div>;
  const start = book?.start || 1000;
  const eq = Number(book?.equity ?? start);
  const up = eq >= start;
  return (
    <div style={box}>
      <div style={{ fontSize: 11.5, color: '#7CC4FF' }}>Proven book</div>
      <div className="font-num" style={{ fontSize: 20, fontWeight: 800, marginTop: 2, color: eq <= 0 ? '#EF4444' : up ? '#22C55E' : '#EF4444' }}>{eq <= 0 ? 'Depleted' : fmtUsd(eq, false)}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
        {book?.signals ? `${book.signals} signals · ${book.wins} won · max drawdown ${book.maxDdPct}%` : `${provenCount} Proven channel${provenCount === 1 ? '' : 's'} · awaiting signals`}
      </div>
      <div style={{ fontSize: 11.5, marginTop: 4 }}>From {fmtUsd(start, false)}{book?.riskPct ? ` at ${book.riskPct}% risk` : ''} · post-promotion trades only</div>
      {(book?.bySource || []).length > 0 && (
        <div style={{ marginTop: 6 }}>
          {book.bySource.map((c) => (
            <div key={c.source} className="font-num" style={{ display: 'flex', gap: 6, fontSize: 11.5 }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.source}</span>
              <span style={{ color: c.r >= 0 ? '#22C55E' : '#EF4444' }}>{c.wins}/{c.n} · {rTxt(c.r)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PotentialCard({ trades, settings }) {
  const ladder = settings?.broker_settings?.ladder;
  const book = ladder?.book;
  const stages = Object.values(ladder?.channels || {}).map((c) => c.stage);
  const provenCount = stages.filter((st) => st === 'proven' || st === 'real').length;
  const realCount = stages.filter((st) => st === 'real').length;
  const start = Number(settings?.paper_balance) || 1000;
  const riskPct = settings?.risk_mode === 'fixed' ? ((Number(settings?.risk_usdt) || 10) / start) * 100 : Number(settings?.risk_pct) || 1;
  const p = useMemo(() => potentialReport(trades, { start, riskPct, goal: GOAL }), [trades, start, riskPct]);
  if (!p) return null;
  const top = p.channels.filter((c) => c.avgR > 0).slice(0, 5);
  const worst = p.channels.filter((c) => c.avgR < 0).slice(-3).reverse();

  return (
    <div className="tx-board">
      <div className="tx-sub">Projection</div>
      <div className="tx-row-note" style={{ padding: '0 14px 10px' }}>
        {p.trades} trades · {p.spanDays} day{p.spanDays === 1 ? '' : 's'} · {fmtUsd(start, false)} at {+riskPct.toFixed(1)}% risk · avg {rTxt(p.avgAll)}
        {p.trades < 30 ? ' Early estimate.' : ''}
      </div>
      <div style={{ display: 'flex', gap: 10, padding: '0 14px 8px', flexWrap: 'wrap' }}>
        <Replay title="All signals" sub={`${p.trades} trades`} r={p.all} start={start} />
        <ProvenBook book={book} provenCount={provenCount} />
      </div>
      {p.best.n > 0 && (
        <div className="tx-row-note" style={{ padding: '0 14px 12px' }}>
          Hindsight: today&apos;s {p.winners.length} best channels from day one would turn {fmtUsd(start, false)} into {p.best.bust ? '$0' : fmtUsd(p.best.end, false)} (max drawdown {p.best.maxDd}%). Not a forecast.
        </div>
      )}
      {top.length > 0 && (
        <div style={{ padding: '0 14px 8px' }}>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 4 }}>Top contributors · per week</div>
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
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 4 }}>Detractors · per week</div>
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
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 4 }}>Real-money readiness</div>
        {[...p.checks.filter((c) => !/Following the winners/.test(c.text)), { ok: provenCount > 0 && Number(book?.equity) > (book?.start || 1000) && (book?.signals || 0) >= 10, text: `Proven book profitable over 10+ signals (${book?.signals || 0})` }, { ok: realCount > 0, text: `A channel at Real (${realCount})` }].map((c) => <div key={c.text} style={{ fontSize: 12.5, padding: '2px 0', color: c.ok ? '#22C55E' : 'var(--text-2)' }}>{c.ok ? '✓' : '○'} {c.text}</div>)}
      </div>
    </div>
  );
}
