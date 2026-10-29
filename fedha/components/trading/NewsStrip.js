import { useEffect, useState } from 'react';
import { base } from './util';

// "News ahead": high-impact releases in the next 24 h for the markets Luxe trades, and what the news guard
// does to new trades on the open chart (lib/news-guard.js). Refreshes every 5 minutes.
const fmtIn = (ms) => {
  if (ms <= 0) return `${Math.round(-ms / 60e3)}m ago`;
  const m = Math.round(ms / 60e3);
  return m < 60 ? `in ${m}m` : `in ${Math.floor(m / 60)}h ${m % 60}m`;
};
const clock = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function NewsStrip({ symbol }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let dead = false;
    const load = () => fetch(`/api/trading/news?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null)).then((j) => { if (!dead && j) setData(j); }).catch(() => {});
    load();
    const a = setInterval(load, 5 * 60e3);
    const b = setInterval(() => setNow(Date.now()), 30e3);
    return () => { dead = true; clearInterval(a); clearInterval(b); };
  }, [symbol]);

  const events = data?.events || [];
  if (!events.length) return null;
  const check = data.check;
  const tone = check?.level === 'danger' ? '#EF4444' : check?.level === 'caution' ? '#F59E0B' : '#64748B';
  const next = events.find((e) => e.at > now) || events[0];
  const label = check?.level === 'danger' ? `Skipping new ${base(symbol)} trades on real accounts (quarter lot on paper)`
    : check?.level === 'caution' ? `New ${base(symbol)} trades at half lot` : null;

  return (
    <div style={{ margin: '6px 0', border: `1px solid ${tone}55`, background: `${tone}14`, borderRadius: 10, padding: '7px 10px', fontSize: 12.5 }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center', width: '100%', flexWrap: 'wrap' }}>
        <b style={{ color: tone }}>📰 {label ? 'NEWS GUARD' : 'NEWS AHEAD'}</b>
        {label && <span style={{ color: tone }}>{label}: {check.event.currency} {check.event.title}</span>}
        {!label && next && <span>{next.currency} {next.title} · {clock(next.at)} ({fmtIn(next.at - now)})</span>}
        <span style={{ flex: 1 }} />
        <span style={{ color: 'var(--text-3)' }}>{events.length} today {open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
          {events.map((e) => {
            const d = e.at - now;
            const hot = d <= data.windows.caution.before && d >= -data.windows.caution.after;
            return (
              <div key={`${e.title}${e.at}`} style={{ display: 'flex', gap: 8, opacity: d < -data.windows.caution.after ? 0.5 : 1 }}>
                <span className="font-num" style={{ width: 44, color: hot ? '#F59E0B' : 'var(--text-2)' }}>{clock(e.at)}</span>
                <b style={{ width: 34 }}>{e.currency}</b>
                <span style={{ flex: 1 }}>{e.title}{e.forecast ? <span style={{ color: 'var(--text-3)' }}> · f {e.forecast} / p {e.previous || '–'}</span> : null}</span>
                <span style={{ color: 'var(--text-3)' }}>{fmtIn(d)}</span>
              </div>
            );
          })}
          <div style={{ color: 'var(--text-3)', fontSize: 11.5, marginTop: 2 }}>15 min before to 10 min after: real accounts skip, paper trades a quarter lot. The hour before (and 30 min after): half lot.</div>
        </div>
      )}
    </div>
  );
}
