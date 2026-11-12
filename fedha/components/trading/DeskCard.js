import { useEffect, useState } from 'react';

// Trading → Channels: the Desk (lib/desk.js, lib/desk-daily.js, lib/followups.js).
// What gold is doing now, how the Desk's picks have done against everything else, the last signals it scored,
// the review of the day, and the switch that lets its picks trade the real account.
const rTxt = (r) => (r == null ? '—' : `${r >= 0 ? '+' : ''}${Number(r).toFixed(2)}R`);
const tone = (r) => (r == null ? 'var(--text-3)' : r > 0.05 ? '#22C55E' : r < -0.05 ? '#EF4444' : 'var(--text-3)');
const VERDICT = { take: { text: 'Take', color: '#22C55E' }, small: { text: 'Lean', color: '#F59E0B' }, skip: { text: 'Skip', color: '#EF4444' }, learning: { text: 'Learning', color: 'var(--text-3)' } };
const ago = (iso) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60e3); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const box = { padding: 12, borderRadius: 10, background: 'rgba(132,142,156,.08)' };
const label = { fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-3)' };

function Row({ name, s, strong }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 54px 64px 46px', gap: 6, fontSize: 12.5, padding: '5px 0', fontWeight: strong ? 800 : 500 }}>
      <span>{name}</span>
      <span className="font-num" style={{ textAlign: 'right', color: 'var(--text-3)' }}>{s.n}</span>
      <span className="font-num" style={{ textAlign: 'right', color: tone(s.avgR) }}>{rTxt(s.avgR)}</span>
      <span className="font-num" style={{ textAlign: 'right', color: 'var(--text-3)' }}>{s.winPct == null ? '—' : `${s.winPct}%`}</span>
    </div>
  );
}
function Table({ title, sub, t }) {
  return (
    <div style={{ ...box, flex: 1, minWidth: 220 }}>
      <div style={label}>{title}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '2px 0 6px' }}>{sub}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 54px 64px 46px', gap: 6, fontSize: 10.5, color: 'var(--text-3)' }}><span /><span style={{ textAlign: 'right' }}>signals</span><span style={{ textAlign: 'right' }}>average</span><span style={{ textAlign: 'right' }}>won</span></div>
      {t.diamond && <Row name="💎 Diamond" s={t.diamond} strong />}
      <Row name="Desk said take" s={t.take} strong />
      <Row name="Desk said lean" s={t.small} />
      <Row name="Desk said skip" s={t.skip} />
      <div style={{ borderTop: '1px solid var(--border)', marginTop: 4 }} />
      <Row name="Every signal" s={t.all} />
    </div>
  );
}

export default function DeskCard() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [openReview, setOpenReview] = useState(0);
  const load = async (body) => {
    try {
      const r = await fetch('/api/trading/desk', body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not load the Desk.');
      setD(j); setErr('');
    } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };
  useEffect(() => { load(); }, []);

  const toggleReal = () => {
    if (!d) return;
    if (!d.real && !window.confirm('Let the Desk\'s 💎 diamond signals trade your REAL account?\n\nOnly 💎 diamonds trade: a "take" from a channel with 4+ closed signals that wins 60%+ of them and has not lost its last two. 1.5x lots, inside your daily loss limit. Channels that reached Real keep trading as before.')) return;
    setBusy('real'); load({ real: !d.real });
  };

  if (err && !d) return <div className="card" style={{ padding: 14, fontSize: 12.5, color: 'var(--text-3)' }}>The Desk: {err}</div>;
  if (!d) return <div className="card" style={{ padding: 14, fontSize: 12.5, color: 'var(--text-3)' }}>The Desk is loading…</div>;
  const m = d.market;
  const learning = d.history.scored === 0;
  const rev = d.reviews[openReview];
  const arrow = (x) => (x === 'up' ? '▲' : '▼');
  const col = (x) => (x === 'up' ? '#22C55E' : '#EF4444');

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>🧠 The Desk</div>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>scores every signal from your own results</span>
      </div>

      {/* The market now */}
      <div style={{ ...box, marginTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <div style={{ ...label, flex: 1 }}>Gold right now</div>
          {m && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{ago(m.at)}</span>}
          <button className="btn-ghost" style={{ padding: '3px 9px', fontSize: 11.5 }} disabled={!!busy} onClick={() => { setBusy('market'); load({ refresh: true }); }}>{busy === 'market' ? '…' : '↻'}</button>
        </div>
        {m ? (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', marginTop: 4 }}>
              <span className="font-num" style={{ fontSize: 20, fontWeight: 800 }}>{Number(m.price).toLocaleString()}</span>
              <span className="font-num" style={{ fontSize: 12.5, color: m.change24h >= 0 ? '#22C55E' : '#EF4444' }}>{m.change24h >= 0 ? '+' : ''}{m.change24h}% in 24 h</span>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>15 min <b style={{ color: col(m.m15) }}>{arrow(m.m15)}</b> · 1 hour <b style={{ color: col(m.h1) }}>{arrow(m.h1)}</b> · slow drift <b style={{ color: col(m.slow) }}>{arrow(m.slow)}</b></span>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, marginTop: 6 }}>{m.summary}</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>The facts favour: <b style={{ color: m.favours === 'buys' ? '#22C55E' : m.favours === 'sells' ? '#EF4444' : 'var(--text-2)' }}>{m.favours}</b> · moves about {m.atr} an hour · {m.session}</div>
            {m.watch?.length > 0 && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 6 }}>{m.watch.map((w, i) => <div key={i}>• {w}</div>)}</div>}
            {m.caution && <div style={{ fontSize: 12, color: '#F59E0B', marginTop: 6 }}>⚠ {m.caution}</div>}
            <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 6 }}>Measured from price candles and put into words by AI. It describes the market; it cannot predict it.</div>
          </>
        ) : <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 4 }}>The first read arrives within the hour. Tap ↻ to get it now.</div>}
      </div>

      {/* Do its picks beat everything else? */}
      {learning ? (
        <div style={{ ...box, marginTop: 10, fontSize: 12.5, color: 'var(--text-2)' }}>Learning: {d.closed} of {d.needed} closed signals needed before the Desk starts scoring.</div>
      ) : (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
          <Table title="On your history" sub={`Each of ${d.history.scored} past signals scored using only what had closed before it.`} t={d.history} />
          <Table title="Live" sub={d.live.all.n ? `Scored as they arrived, since ${new Date(d.live.since).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.` : 'Scored as they arrive. Results appear as signals close.'} t={d.live} />
        </div>
      )}
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.5 }}>Votes per signal: has this channel, this side (buy or sell) and this time of day each done better than your average signal? Take = at least 2 more yes than no. The Live table is the honest test: it could not have seen those results.</div>

      {/* How it learns: the rule in use, and the others it tests in the background */}
      {!learning && (
        <div style={{ ...box, marginTop: 10 }}>
          <div style={label}>How the Desk learns</div>
          <div style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.45 }}>Scoring with: <b>{d.ruleLabel}</b></div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.45 }}>It also scores every signal with the other rules below, without trading on them. Each night it checks them on signals they could not have seen, and switches only when one made at least 3R more on your history and more over the latest 60 signals.</div>
          {d.ruleCheck?.rows?.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {d.ruleCheck.rows.map((r) => (
                <div key={r.rule} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ flex: 1, minWidth: 0, fontWeight: r.rule === d.rule ? 800 : 500 }}>{r.rule === d.rule ? '● ' : ''}{r.label}</span>
                  <span className="font-num" title="If you had followed it: take 1.5x, small 1x, skip nothing" style={{ color: tone(r.all), fontWeight: 700 }}>{rTxt(r.all)}</span>
                  <span className="font-num" style={{ color: 'var(--text-3)', minWidth: 64, textAlign: 'right' }}>last 60 {rTxt(r.last60)}</span>
                </div>
              ))}
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>Checked {new Date(d.ruleCheck.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}. R if you had followed each rule (take 1.5x, small 1x, skip nothing).</div>
            </div>
          )}
          {!d.ruleCheck && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>The first check runs with tonight's review.</div>}
          {d.ruleLog?.length > 0 && <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 4 }}>Last change: {d.rules[d.ruleLog[0].from]} → {d.rules[d.ruleLog[0].to]} ({new Date(d.ruleLog[0].at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})</div>}
        </div>
      )}

      {/* Latest scores */}
      {d.live.recent.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={label}>Latest signals</div>
          {d.live.recent.slice(0, 6).map((s) => {
            const v = VERDICT[s.verdict] || VERDICT.learning;
            return (
              <div key={s.id} style={{ padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12.5 }}>
                  <span style={{ fontWeight: 800, color: s.diamond ? '#38BDF8' : v.color, minWidth: 44 }}>{s.diamond ? '💎 Diamond' : v.text}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.side} {s.symbol} · {s.source}</span>
                  <span className="font-num" style={{ color: tone(s.r), fontWeight: 700 }}>{s.r == null ? (['open', 'pending'].includes(s.status) ? 'open' : '—') : rTxt(s.r)}</span>
                </div>
                {s.why?.length > 0 && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{s.why.join(' · ')}</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* Review of the day */}
      {rev && (
        <div style={{ ...box, marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
            <div style={{ ...label, flex: 1 }}>Review of the day</div>
            {d.reviews.map((r, i) => <button key={r.date} onClick={() => setOpenReview(i)} style={{ all: 'unset', cursor: 'pointer', fontSize: 11, padding: '2px 7px', borderRadius: 8, background: i === openReview ? 'var(--accent-dim)' : 'transparent', color: i === openReview ? 'var(--accent)' : 'var(--text-3)' }}>{new Date(`${r.date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</button>)}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6, lineHeight: 1.45 }}><span className="font-num" style={{ color: tone(rev.totalR) }}>{rTxt(rev.totalR)}</span> · {rev.headline}</div>
          {rev.worked?.map((x, i) => <div key={`w${i}`} style={{ fontSize: 12, marginTop: 4, color: 'var(--text-2)' }}><span style={{ color: '#22C55E' }}>✓</span> {x}</div>)}
          {rev.hurt?.map((x, i) => <div key={`h${i}`} style={{ fontSize: 12, marginTop: 4, color: 'var(--text-2)' }}><span style={{ color: '#EF4444' }}>✕</span> {x}</div>)}
          {rev.mistakes?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 800 }}>The Desk's mistakes</div>
              {rev.mistakes.map((x, i) => <div key={`m${i}`} style={{ fontSize: 12, marginTop: 3, color: 'var(--text-2)' }}><span style={{ color: '#F59E0B' }}>!</span> {x}</div>)}
              {rev.lesson && <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.45 }}>{rev.lesson}</div>}
            </div>
          )}
          {rev.ruleNote && <div style={{ fontSize: 12, marginTop: 6, color: 'var(--accent)' }}>🧠 {rev.ruleNote}</div>}
          {rev.change && <div style={{ fontSize: 12, marginTop: 6 }}><b>Worth testing:</b> {rev.change}</div>}
        </div>
      )}
      {!rev && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 10 }}>The first review of the day arrives after 21:00.</div>}

      {/* Real money */}
      <div style={{ ...box, marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', border: d.real ? '1px solid rgba(34,197,94,.4)' : '1px solid transparent' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>Desk picks trade the real account</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.45 }}>{d.real ? 'On: only 💎 diamonds trade real money (1.5x lots), even from a channel that has not reached Real. Rare on purpose: 2 in the last 45 days on your history, both won.' : 'Off: only channels that reached Real trade real money. A 💎 diamond is a take from a channel with 4+ closed signals that wins 60%+ of them and has not lost its last two. Rare: 2 in 45 days on your history, both won. Watch the 💎 row in the Live table first.'}</div>
        </div>
        <button className={d.real ? 'btn-primary' : 'btn-ghost'} disabled={!!busy} onClick={toggleReal}>{busy === 'real' ? '…' : d.real ? 'On' : 'Off'}</button>
      </div>
      {err && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{err}</div>}
    </div>
  );
}
