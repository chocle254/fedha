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

// The Proven book (lib/ladder.js): a paper account that only trades channels AFTER they earned Proven, at the
// same risk as the main account. No hindsight: this is what following only proven channels actually did.
function ProvenBook({ book, provenCount }) {
  const box = { flex: 1, minWidth: 140, padding: 12, borderRadius: 10, background: 'rgba(124,196,255,.08)', border: '1px solid rgba(124,196,255,.25)' };
  if (!provenCount) return <div style={{ ...box, fontSize: 12, color: 'var(--text-3)' }}>⭐ Proven channels only: no channel has earned Proven yet, so this account hasn't started.</div>;
  const start = book?.start || 1000;
  const eq = Number(book?.equity ?? start);
  const up = eq >= start;
  return (
    <div style={box}>
      <div style={{ fontSize: 11.5, color: '#7CC4FF' }}>⭐ Proven channels only · real results</div>
      <div className="font-num" style={{ fontSize: 20, fontWeight: 800, marginTop: 2, color: eq <= 0 ? '#EF4444' : up ? '#22C55E' : '#EF4444' }}>{eq <= 0 ? 'Blown' : fmtUsd(eq, false)}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
        {book?.signals ? `${book.signals} signals · ${book.wins} won · worst drop ${book.maxDdPct}%` : `${provenCount} proven channel${provenCount === 1 ? '' : 's'}, waiting for their next signal`}
      </div>
      <div style={{ fontSize: 11.5, marginTop: 4 }}>From {fmtUsd(start, false)}{book?.riskPct ? ` at ${book.riskPct}% risk` : ''}, counting only trades after each channel was promoted.</div>
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
      <div className="tx-sub">Potential: what the channels would make</div>
      <div className="tx-row-note" style={{ padding: '0 14px 10px' }}>
        {p.trades} closed trades over {p.spanDays} day{p.spanDays === 1 ? '' : 's'}, replayed in order on {fmtUsd(start, false)} risking {+riskPct.toFixed(1)}% of the balance each trade. All signals average {rTxt(p.avgAll)} a trade.
        {p.trades < 30 ? ' Early read: most channels have only a handful of trades, so this will move a lot.' : ''}
      </div>
      <div style={{ display: 'flex', gap: 10, padding: '0 14px 8px', flexWrap: 'wrap' }}>
        <Replay title="Following every signal" sub={`${p.trades} trades`} r={p.all} start={start} />
        <ProvenBook book={book} provenCount={provenCount} />
      </div>
      {p.best.n > 0 && (
        <div className="tx-row-note" style={{ padding: '0 14px 12px' }}>
          Hindsight only: if you had somehow picked today's {p.winners.length} winning channels on day one, {fmtUsd(start, false)} would be {p.best.bust ? 'blown' : fmtUsd(p.best.end, false)} (worst drop {p.best.maxDd}%). Nobody can know the winners in advance, so that is not a forecast. The Proven book above is the real test.
        </div>
      )}
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
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 4 }}>Ready for real money? Step 2 must pass: only channels that win in the Proven book go real.</div>
        {[...p.checks.filter((c) => !/Following the winners/.test(c.text)), { ok: provenCount > 0 && Number(book?.equity) > (book?.start || 1000) && (book?.signals || 0) >= 10, text: `The Proven book is in profit over 10+ signals (${book?.signals || 0} so far, ${fmtUsd(Number(book?.equity ?? 1000), false)})` }, { ok: realCount > 0, text: `A channel has reached Real: it also won on its own in the Proven book (${realCount} so far)` }].map((c) => <div key={c.text} style={{ fontSize: 12.5, padding: '2px 0', color: c.ok ? '#22C55E' : 'var(--text-2)' }}>{c.ok ? '✓' : '○'} {c.text}</div>)}
      </div>
    </div>
  );
}
