import { useEffect, useState } from 'react';
import { fmtUsd, base } from './util';

// Trading → Paper accounts: three paper accounts on the same signals, side by side (pages/api/trading/books.js).
//   Main           the account that measures every channel (Desk sizing: take 15%, small 10%, skip 0.25%)
//   Big on takes   take 25%, small 10%, skip 0.25%
//   Diamonds only  only 💎 diamonds, 15% each: the closest thing to what the real account will do
const ABOUT = {
  takes: 'Take 25% · small 10% · skip 0.25% watch stake',
  diamond: 'Only 💎 diamonds, 15% each. The closest thing to the real account.',
  coach: "The Coach's own calls: take 15% · small 10% · skip 0.25%",
};
const tone = (v) => (v > 0.005 ? '#22C55E' : v < -0.005 ? '#EF4444' : 'var(--text-3)');
const pct = (eq, start) => (start > 0 ? ((eq - start) / start) * 100 : 0);

export default function PaperBooksCard() {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState('');
  const load = () => fetch('/api/trading/books', { cache: 'no-store' }).then((r) => r.json()).then(setD).catch(() => setD({ error: true }));
  useEffect(() => { load(); const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 5 * 60e3); return () => clearInterval(t); }, []);
  const reset = async (name, label) => {
    if (!window.confirm(`Start "${label}" again from $1,000? Its trades so far stay in the history.`)) return;
    setBusy(name);
    try { const r = await fetch('/api/trading/books', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reset: name }) }); setD(await r.json()); } finally { setBusy(''); }
  };
  if (!d || d.error) return null;
  const rows = [{ ...d.main, about: 'Measures every channel. Desk sizing: take 15% · small 10% · skip 0.25%', main: true }, ...d.books.map((b) => ({ ...b, about: ABOUT[b.name] }))];

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: 15, fontWeight: 800 }}>Paper accounts</div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2, lineHeight: 1.45 }}>The same signals on four accounts, each sized its own way. Watch them side by side before any real money moves.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, marginTop: 10 }}>
        {rows.map((b) => {
          const ch = pct(b.equity, b.start);
          return (
            <div key={b.name} style={{ padding: 12, borderRadius: 10, background: 'rgba(132,142,156,.08)', border: b.name === 'diamond' ? '1px solid rgba(56,189,248,.35)' : '1px solid transparent' }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{b.name === 'diamond' ? '💎 ' : b.name === 'takes' ? '🎯 ' : b.name === 'coach' ? '🎓 ' : ''}{b.main ? 'Main' : b.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.4 }}>{b.about}</div>
              <div className="font-num" style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{fmtUsd(b.equity, false)}</div>
              <div className="font-num" style={{ fontSize: 12, color: tone(ch) }}>{ch >= 0 ? '+' : ''}{ch.toFixed(1)}% from {fmtUsd(b.start, false)}</div>
              {!b.main && (
                <>
                  <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 4 }}>{b.wins} won · {b.losses} lost · {b.open} open{b.since ? ` · since ${new Date(b.since).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    {b.recent?.length > 0 && <button className="btn-ghost" style={{ width: 'auto', padding: '4px 10px', fontSize: 11.5 }} onClick={() => setOpen(open === b.name ? '' : b.name)}>{open === b.name ? 'Hide trades' : 'Trades'}</button>}
                    <button className="btn-ghost" style={{ width: 'auto', padding: '4px 10px', fontSize: 11.5 }} disabled={!!busy} onClick={() => reset(b.name, b.label)}>{busy === b.name ? '…' : 'Start again'}</button>
                  </div>
                  {open === b.name && b.recent.map((t) => (
                    <div key={t.id} style={{ display: 'flex', gap: 6, fontSize: 11.5, padding: '4px 0', borderTop: '1px solid var(--border)', marginTop: 4 }}>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.side} {base(t.symbol)} · {t.source}</span>
                      <span className="font-num" style={{ color: ['open', 'pending'].includes(t.status) ? 'var(--text-3)' : tone(t.pnl) }}>{['open', 'pending'].includes(t.status) ? `risk ${fmtUsd(t.risk, false)}` : fmtUsd(t.pnl)}</span>
                    </div>
                  ))}
                  {!b.trades && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{b.name === 'diamond' ? 'Waiting for the first 💎 diamond. They are rare: 2 in the last 45 days.' : 'Takes the next signal.'}</div>}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// The three balances in one row at the top of the trading page; tapping opens the full card (Channels tab).
export function PaperBooksStrip({ onOpen }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    const load = () => fetch('/api/trading/books', { cache: 'no-store' }).then((r) => r.json()).then(setD).catch(() => {});
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 5 * 60e3);
    return () => clearInterval(t);
  }, []);
  if (!d || d.error) return null;
  const rows = [{ ...d.main, short: 'Main' }, ...d.books.map((b) => ({ ...b, short: b.name === 'diamond' ? '💎 Diamonds' : b.name === 'coach' ? '🎓 Coach' : '🎯 Big on takes' }))];
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
      {rows.map((b) => {
        const ch = pct(b.equity, b.start);
        return (
          <button key={b.name} type="button" onClick={onOpen} style={{ all: 'unset', cursor: 'pointer', flex: '1 1 0', minWidth: 96, padding: '7px 10px', borderRadius: 10, background: 'rgba(132,142,156,.12)', border: b.name === 'diamond' ? '1px solid rgba(56,189,248,.35)' : '1px solid transparent' }}>
            <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 700 }}>{b.short}</div>
            <div className="font-num" style={{ fontSize: 14, fontWeight: 800 }}>{fmtUsd(b.equity, false)}</div>
            <div className="font-num" style={{ fontSize: 10.5, color: tone(ch) }}>{ch >= 0 ? '+' : ''}{ch.toFixed(1)}%</div>
          </button>
        );
      })}
    </div>
  );
}
