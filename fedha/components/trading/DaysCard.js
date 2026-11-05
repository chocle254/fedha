import { useEffect, useState } from 'react';

// Trading → Signals: good days and bad days (lib/trading-days.js). A calendar of recent days, then how each
// weekday and trading session has done. A weekday or session is only called good or bad once enough separate
// days back it up; until then it says "early", so one bad Monday isn't mistaken for a rule.
const rTxt = (r) => `${r >= 0 ? '+' : ''}${Number(r).toFixed(2)}R`;
const tone = (r) => (r > 0.05 ? '#22C55E' : r < -0.05 ? '#EF4444' : 'var(--text-3)');
const BADGE = {
  good: { text: 'Good', color: '#22C55E' },
  bad: { text: 'Bad', color: '#EF4444' },
  mixed: { text: 'No clear edge', color: 'var(--text-3)' },
  early: { text: 'Early', color: '#F59E0B' },
};

function Bars({ rows, minDays, unit }) {
  const max = Math.max(0.5, ...rows.map((x) => Math.abs(x.avgR)));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
      {rows.map((x) => {
        const b = BADGE[x.verdict] || BADGE.early;
        const w = Math.round((Math.abs(x.avgR) / max) * 50);
        return (
          <div key={x.key} style={{ display: 'grid', gridTemplateColumns: '92px 1fr 64px', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <div style={{ lineHeight: 1.2 }}>
              <b>{x.label}</b>{x.hours ? <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{x.hours}</div> : null}
            </div>
            <div style={{ position: 'relative', height: 14, background: 'rgba(132,142,156,.10)', borderRadius: 4 }}>
              <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--border)' }} />
              <div style={{ position: 'absolute', top: 2, bottom: 2, borderRadius: 3, background: tone(x.avgR), [x.avgR >= 0 ? 'left' : 'right']: '50%', width: `${w}%`, opacity: x.verdict === 'early' ? 0.45 : 1 }} />
            </div>
            <div className="font-num" style={{ textAlign: 'right', color: tone(x.avgR), fontWeight: 700 }}>{rTxt(x.avgR)}</div>
            <div style={{ gridColumn: '2 / 4', fontSize: 10.5, color: 'var(--text-3)', marginTop: -4 }}>
              <span style={{ color: b.color, fontWeight: 700 }}>{b.text}</span>
              {' · '}{x.n} signals, {x.winPct}% won · {x.days} {unit}{x.days === 1 ? '' : 's'}
              {x.verdict === 'early' ? ` (needs ${minDays})` : ` · ${x.conf}% sure it's ${x.avgR >= 0 ? 'positive' : 'negative'}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function DaysCard() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    const tz = -new Date().getTimezoneOffset();
    fetch(`/api/trading/days?tz=${tz}`, { cache: 'no-store' }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not load.');
      setD(j);
    }).catch((e) => setErr(e.message));
  }, []);

  const box = { marginTop: 14, padding: 14, borderRadius: 12, background: 'var(--bg-2)', border: '1px solid var(--border)' };
  if (err) return <div style={box}><b>📅 Good days &amp; bad days</b><div style={{ fontSize: 12, color: '#EF4444', marginTop: 6 }}>{err}</div></div>;
  if (!d) return <div style={box}><b>📅 Good days &amp; bad days</b><div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>Loading…</div></div>;
  if (!d.signals) return <div style={box}><b>📅 Good days &amp; bad days</b><div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>No closed signals yet.</div></div>;

  return (
    <div style={box}>
      <div style={{ fontWeight: 800 }}>📅 Good days &amp; bad days</div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.45 }}>
        Every closed signal from {d.from} to {d.to} ({d.signals} signals over {d.dayCount} trading days), in R so balance changes don&apos;t skew it. The day is when the signal was posted.
      </div>

      {d.patterns.length > 0 ? (
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {d.patterns.map((p) => (
            <span key={p.label} style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999, border: `1px solid ${p.verdict === 'good' ? '#22C55E' : '#EF4444'}`, color: p.verdict === 'good' ? '#22C55E' : '#EF4444' }}>
              {p.verdict === 'good' ? '▲' : '▼'} {p.label}: {rTxt(p.avgR)} a signal over {p.days} days
            </span>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12, marginTop: 8, color: '#F59E0B' }}>No confirmed pattern yet: a weekday needs 4 separate days and a session 5 before it counts.</div>
      )}

      {/* Calendar: newest day first */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginTop: 12, paddingBottom: 4 }}>
        {d.daily.map((x) => (
          <div key={x.date} title={`${x.n} signals, ${x.winPct}% won${x.best ? ` · best ${x.best.source} ${rTxt(x.best.r)}` : ''}${x.worst ? ` · worst ${x.worst.source} ${rTxt(x.worst.r)}` : ''}`}
            style={{ flex: '0 0 62px', padding: '6px 4px', borderRadius: 8, textAlign: 'center', background: x.totalR > 0 ? 'rgba(34,197,94,.12)' : x.totalR < 0 ? 'rgba(239,68,68,.12)' : 'rgba(132,142,156,.08)', border: `1px solid ${tone(x.totalR)}55` }}>
            <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{x.weekday} {Number(x.date.slice(8))}</div>
            <div className="font-num" style={{ fontSize: 13, fontWeight: 800, color: tone(x.totalR) }}>{rTxt(x.totalR)}</div>
            <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{x.n} · {x.winPct}%</div>
          </div>
        ))}
      </div>
      {(d.bestDay || d.worstDay) && (
        <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>
          {d.bestDay && <div>Best day: <b>{d.bestDay.weekday} {d.bestDay.date.slice(5)}</b>, {rTxt(d.bestDay.totalR)} from {d.bestDay.n} signals{d.bestDay.best ? ` (led by ${d.bestDay.best.source})` : ''}.</div>}
          {d.worstDay && <div>Worst day: <b>{d.worstDay.weekday} {d.worstDay.date.slice(5)}</b>, {rTxt(d.worstDay.totalR)} from {d.worstDay.n} signals{d.worstDay.worst ? ` (worst: ${d.worstDay.worst.source})` : ''}.</div>}
        </div>
      )}

      <div className="muse-label" style={{ marginTop: 14, fontSize: 11 }}>BY WEEKDAY · average per signal</div>
      <Bars rows={d.weekdays} minDays={4} unit="day" />
      <div className="muse-label" style={{ marginTop: 14, fontSize: 11 }}>BY SESSION · when the signal was posted</div>
      <Bars rows={d.sessions} minDays={5} unit="day" />
    </div>
  );
}
