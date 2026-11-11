import { useEffect, useMemo, useState } from 'react';
import { getSetting, setSetting } from '../lib/db';
import { useApp } from '../context/AppContext';

// Planner → 🪩 Night out (pages/api/night-out.js). For the weekend: real places in your town, how to split
// tonight's money (the ride home is set aside first), when to leave and when to head back, what to carry and
// what to leave at home. Luxe suggests the amount from your own numbers: about a tenth of last month's income,
// spread over the month's weekends, and never more than a third of the cash that is free right now.
// Only tonight's plan is kept (one setting, 'night_out', replaced each time).
const pad = (n) => String(n).padStart(2, '0');
const dayKey = () => { const d = new Date(); if (d.getHours() < 6) d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const kes = (n) => `KSh ${Math.round(Number(n) || 0).toLocaleString('en-KE')}`;
const LABEL = { ride_home: ['🏠', 'Ride home (do not touch)'], transport_there: ['🛵', 'Getting there'], entry: ['🎟️', 'Entry'], drinks: ['🍹', 'Drinks'], food: ['🍗', 'Food'], buffer: ['🛟', 'Buffer'] };
const fmt12 = (t) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`; };

export default function NightOut({ homeLoc, floating }) {
  const { transactions = [] } = useApp();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState(null);
  const [budget, setBudget] = useState('');
  const [vibe, setVibe] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const city = homeLoc ? String(homeLoc.name).split(',')[0] : '';
  const weekend = [5, 6, 0].includes(new Date().getDay());

  // What you can afford, from your own money.
  const suggest = useMemo(() => {
    const from = Date.now() - 30 * 864e5;
    const income = transactions.filter((t) => t.type === 'income' && t.category !== 'investment' && new Date(t.date).getTime() >= from).reduce((s, t) => s + Number(t.amount || 0), 0);
    const byIncome = (income * 0.1) / 4;
    const byCash = Math.max(0, Number(floating) || 0) / 3;
    const n = Math.floor(Math.min(byIncome || byCash, byCash) / 50) * 50;
    return { n: Math.max(0, n), income };
  }, [transactions, floating]);

  useEffect(() => { getSetting('night_out', null).then((p) => { if (p?.day === dayKey() && p.plan) { setPlan(p.plan); setOpen(true); } }).catch(() => {}); }, []);
  useEffect(() => { if (!budget && suggest.n >= 200) setBudget(String(suggest.n)); }, [suggest.n]); // eslint-disable-line react-hooks/exhaustive-deps

  const make = async () => {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/night-out', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ city, ...(homeLoc?.lat != null ? { lat: homeLoc.lat, lon: homeLoc.lon } : {}), budget: Number(String(budget).replace(/[^\d.]/g, '')), vibe, day: new Date().toLocaleDateString('en-GB', { weekday: 'long' }) }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not plan it.');
      setPlan(j); await setSetting('night_out', { day: dayKey(), plan: j });
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const clear = async () => { setPlan(null); await setSetting('night_out', null); };

  const box = { padding: 12, borderRadius: 12, background: 'var(--card-2)', marginTop: 10 };
  const label = { fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: 'var(--text-3)', textTransform: 'uppercase' };
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ width: '100%', padding: '12px 16px', marginBottom: 14, background: weekend ? 'linear-gradient(135deg, rgba(236,72,153,.16), rgba(139,92,246,.14))' : 'var(--card-2)', border: `1px solid ${weekend ? 'rgba(236,72,153,.4)' : 'var(--border)'}`, borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'left', color: 'var(--text)' }}>
        <span style={{ fontSize: 22 }}>🪩</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Night out</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Where to go, how much to take and on what, when to head home.</div>
        </div>
      </button>
    );
  }

  return (
    <div className="card" style={{ padding: 14, marginBottom: 14, borderColor: 'rgba(236,72,153,.35)' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1, fontSize: 15, fontWeight: 800 }}>🪩 Night out{city ? ` in ${city}` : ''}</div>
        <button className="btn-ghost" style={{ width: 'auto', padding: '4px 10px', fontSize: 12 }} onClick={() => setOpen(false)}>Hide</button>
      </div>

      {!plan && (
        <>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 8, lineHeight: 1.5 }}>
            {suggest.n >= 200
              ? <>Luxe suggests <b>{kes(suggest.n)}</b> tonight: about a tenth of the {kes(suggest.income)} you brought in over the last 30 days, shared over four weekends, and no more than a third of your free cash.</>
              : 'There is not much free cash right now. A night in, or a very small one, is the honest call. You can still set an amount.'}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <input className="input" style={{ flex: 1 }} inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Tonight's total, KSh" />
            <button className="btn-primary" style={{ width: 'auto', padding: '0 14px' }} disabled={busy || !city} onClick={make}>{busy ? 'Planning…' : 'Plan it'}</button>
          </div>
          <input className="input" style={{ marginTop: 6 }} value={vibe} onChange={(e) => setVibe(e.target.value)} placeholder="Optional: the vibe (amapiano, chill lounge, live band, with two friends…)" />
          {!city && <div style={{ fontSize: 12, color: '#F59E0B', marginTop: 6 }}>Set your location on the weather card above first, so Luxe searches the right town.</div>}
          {err && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 6 }}>{err}</div>}
        </>
      )}

      {plan && (
        <>
          <div style={box}>
            <div style={label}>The money · {kes(plan.budget)} in total</div>
            {Object.keys(LABEL).filter((k) => plan.split?.[k] > 0).map((k) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 6, fontWeight: k === 'ride_home' ? 800 : 500 }}>
                <span>{LABEL[k][0]} {LABEL[k][1]}</span><span className="font-num">{kes(plan.split[k])}</span>
              </div>
            ))}
            {plan.drinks_plan && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.45 }}>{plan.drinks_plan}</div>}
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 8, lineHeight: 1.45 }}>Before you leave: keep only <b>{kes(plan.budget)}</b> on M-Pesa and push the rest into Ziidi. What is not on the phone cannot be spent at 1 AM.</div>
          </div>

          <div style={box}>
            <div style={label}>Where</div>
            {plan.venues?.length ? plan.venues.map((v, i) => (
              <div key={i} style={{ marginTop: 8 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{i + 1}. {v.name}{v.area ? <span style={{ fontWeight: 500, color: 'var(--text-3)' }}> · {v.area}</span> : null}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2, lineHeight: 1.45 }}>{v.why}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{[v.music, v.entry && `Entry: ${v.entry}`, v.note].filter(Boolean).join(' · ')}</div>
                {v.lat != null && <a href={`https://www.google.com/maps/search/${encodeURIComponent(v.name)}/@${v.lat},${v.lon},18z`} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent)' }}>Open in Maps ↗</a>}
              </div>
            )) : <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 6, lineHeight: 1.45 }}>No venue for {plan.city} checked out on the map, and Luxe will not make one up. <a href={`https://www.google.com/maps/search/${encodeURIComponent(`clubs and lounges in ${plan.city}`)}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontWeight: 700 }}>See clubs on Maps ↗</a></div>}
            {plan.venues_from === 'map' && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>The web search named no venue that is really on the map, so these are clubs and bars straight from the map near you.</div>}
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>Venues are checked against the map. Prices and opening nights change: check the venue's page before you go.</div>
          </div>

          {plan.timeline?.length > 0 && (
            <div style={box}>
              <div style={label}>The clock</div>
              {plan.timeline.map((t, i) => <div key={i} style={{ display: 'flex', gap: 10, fontSize: 13, marginTop: 6 }}><b className="font-num" style={{ minWidth: 72 }}>{fmt12(t.time)}</b><span style={{ color: 'var(--text-2)' }}>{t.what}</span></div>)}
            </div>
          )}

          <div style={box}>
            <div style={label}>Leave the house with</div>
            {plan.carry.map((x, i) => <div key={i} style={{ fontSize: 13, marginTop: 5 }}>✓ {x}</div>)}
            {plan.leave_at_home?.length > 0 && <><div style={{ ...label, marginTop: 10 }}>Leave at home</div>{plan.leave_at_home.map((x, i) => <div key={i} style={{ fontSize: 13, marginTop: 5, color: 'var(--text-2)' }}>✕ {x}</div>)}</>}
          </div>

          {plan.rules?.length > 0 && (
            <div style={box}>
              <div style={label}>Tonight's rules</div>
              {plan.rules.map((x, i) => <div key={i} style={{ fontSize: 13, marginTop: 5, lineHeight: 1.45 }}>{i + 1}. {x}</div>)}
            </div>
          )}
          <button className="btn-ghost" style={{ width: '100%', marginTop: 10 }} onClick={clear}>Plan it again</button>
        </>
      )}
    </div>
  );
}
