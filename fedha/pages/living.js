import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../components/Layout';
import { getSetting, setSetting } from '../lib/db';
import { getHomeLocation } from '../lib/day-anchors';
import { useFloatingCash } from '../lib/floating';
import { genId } from '../lib/utils';

// Live a little: the money you have, given something to do.
//   Upkeep forecast  haircut, toiletries, clothes and anything else that comes round again: when each was last
//                    done, when it is next due and what it costs, laid out week by week like a weather forecast,
//                    with the amount to set aside each week so none of them is a surprise.
//   First times      things you have never had or done (pizza is first on the list). "Find it" searches your
//                    town for where it is sold and what it costs (pages/api/life.js). Tick it when you have.
//   A day out        for when you are in the mood to get out: a whole day by yourself inside a budget.
//   Builder day      a productive day for the tech future: four blocks, each opening the right part of Luxe.
// Everything is kept in three small settings (upkeep_items, first_times, living_day); only today's plans are kept.
const pad = (n) => String(n).padStart(2, '0');
const iso = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DAY = 864e5;
const kes = (n) => `KSh ${Math.round(Number(n) || 0).toLocaleString('en-KE')}`;
const fmt12 = (t) => { const [h, m] = String(t).split(':').map(Number); return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`; };
const nice = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

const UPKEEP = [
  { id: 'haircut', name: 'Haircut', emoji: '💈', every: 21, cost: 200, last: null },
  { id: 'toiletries', name: 'Toiletries and skincare', emoji: '🧴', every: 30, cost: 500, last: null },
  { id: 'clothes', name: 'Something new to wear', emoji: '👕', every: 60, cost: 1500, last: null },
  { id: 'treat', name: 'A meal out', emoji: '🍽️', every: 14, cost: 600, last: null },
];
const FIRSTS = ['Pizza', 'A proper burger', 'Shawarma', 'Sushi', 'A cinema film', 'Bowling', 'A live band night', 'Go-karting'];
const BUILDER = [
  ['learn', '📚', 'Learn', 'One lesson of your course with Professor Byte, start to finish.', '/learning', '60-90 min'],
  ['build', '🛠️', 'Build', 'Ninety minutes on your own project: the next milestone, nothing else open.', '/tech-hub', '90 min'],
  ['ship', '🚀', 'Ship', 'Put one small thing where people can see it: a commit, a demo link, a post about what you built.', '/tech-hub', '30 min'],
  ['reach', '🤝', 'Reach', 'One step towards being paid for it: message a lead, apply to one opening, or enter a hackathon.', '/discover', '30 min'],
];

const card = { padding: 16, marginBottom: 12 };
const label = { fontSize: 11, fontWeight: 800, letterSpacing: 0.8, color: 'var(--text-3)', textTransform: 'uppercase' };
const box = { padding: 12, borderRadius: 12, background: 'var(--card-2)', marginTop: 10 };

// When an upkeep item is next due (never done = due now).
const dueOf = (it) => (it.last ? new Date(`${it.last}T12:00:00`).getTime() + Number(it.every || 30) * DAY : Date.now());

function Upkeep() {
  const [items, setItems] = useState(null);
  const [edit, setEdit] = useState(null);
  useEffect(() => { getSetting('upkeep_items', null).then((v) => setItems(Array.isArray(v) && v.length ? v : UPKEEP)).catch(() => setItems(UPKEEP)); }, []);
  const save = (next) => { setItems(next); setSetting('upkeep_items', next.slice(0, 20)).catch(() => {}); };
  if (!items) return null;

  const now = Date.now();
  // Six weeks ahead, each item placed in the week it falls due (and again when it comes round).
  const weeks = Array.from({ length: 6 }, (_, w) => {
    const from = now + w * 7 * DAY; const to = from + 7 * DAY;
    const due = [];
    for (const it of items) {
      let t = dueOf(it);
      if (w === 0 && t < now) { due.push(it); continue; }
      while (t < from) t += Number(it.every || 30) * DAY;
      if (t < to) due.push(it);
    }
    return { w, from, due, cost: due.reduce((s, it) => s + Number(it.cost || 0), 0) };
  });
  const weekly = items.reduce((s, it) => s + (Number(it.cost || 0) * 7) / Math.max(1, Number(it.every || 30)), 0);
  const sorted = [...items].sort((a, b) => dueOf(a) - dueOf(b));
  const when = (it) => {
    const days = Math.round((dueOf(it) - now) / DAY);
    if (!it.last) return ['Never logged: due now', '#F59E0B'];
    if (days < 0) return [`${-days} day${days === -1 ? '' : 's'} overdue`, '#EF4444'];
    if (days === 0) return ['Due today', '#F59E0B'];
    return [`In ${days} day${days === 1 ? '' : 's'}`, days <= 7 ? '#F59E0B' : 'var(--text-3)'];
  };

  return (
    <div className="card" style={card}>
      <div style={label}>Upkeep forecast</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.5 }}>Set aside <b>{kes(Math.ceil(weekly / 10) * 10)} a week</b> and none of these will surprise you.</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginTop: 12 }}>
        {weeks.map((wk) => (
          <div key={wk.w} style={{ padding: '8px 4px', borderRadius: 10, textAlign: 'center', background: wk.due.length ? 'var(--accent-dim)' : 'var(--card-2)', minHeight: 86 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)' }}>{wk.w === 0 ? 'This wk' : wk.w === 1 ? 'Next wk' : nice(iso(new Date(wk.from)))}</div>
            <div style={{ fontSize: 18, margin: '4px 0', minHeight: 24 }}>{wk.due.length ? wk.due.map((it) => it.emoji).join('') : '·'}</div>
            <div className="font-num" style={{ fontSize: 10.5, fontWeight: 700, color: wk.cost ? 'var(--text)' : 'var(--text-3)' }}>{wk.cost ? Math.round(wk.cost).toLocaleString() : 'clear'}</div>
          </div>
        ))}
      </div>

      {sorted.map((it) => {
        const [text, color] = when(it);
        return (
          <div key={it.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--border)', marginTop: 10 }}>
            <span style={{ fontSize: 22 }}>{it.emoji}</span>
            <button type="button" onClick={() => setEdit({ ...it })} style={{ all: 'unset', cursor: 'pointer', flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>{it.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}><span style={{ color, fontWeight: 700 }}>{text}</span> · {kes(it.cost)} · every {it.every} days{it.last ? ` · last ${nice(it.last)}` : ''}</div>
            </button>
            <button className="btn-ghost" style={{ width: 'auto', padding: '6px 10px', fontSize: 12 }} onClick={() => save(items.map((x) => (x.id === it.id ? { ...x, last: iso() } : x)))}>Done today</button>
          </div>
        );
      })}
      <button className="btn-ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => setEdit({ id: null, name: '', emoji: '✨', every: 30, cost: 0, last: null })}>＋ Add something</button>

      {edit && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setEdit(null)}>
          <div className="modal-sheet">
            <div className="modal-header"><span style={{ fontWeight: 800 }}>{edit.id ? 'Edit' : 'Add'}</span><button className="btn-icon" onClick={() => setEdit(null)}>✕</button></div>
            <div className="modal-body">
              <div style={{ display: 'flex', gap: 6 }}>
                <input className="input" style={{ width: 62, textAlign: 'center' }} value={edit.emoji} onChange={(e) => setEdit({ ...edit, emoji: e.target.value.slice(0, 4) })} aria-label="Emoji" />
                <input className="input" style={{ flex: 1 }} placeholder="What (e.g. Haircut)" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-3)', marginTop: 10 }}>How often (days)
                <input className="input" inputMode="numeric" value={edit.every} onChange={(e) => setEdit({ ...edit, every: e.target.value.replace(/\D/g, '') })} style={{ marginTop: 4 }} />
              </label>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-3)', marginTop: 10 }}>What it costs each time (KSh)
                <input className="input" inputMode="decimal" value={edit.cost} onChange={(e) => setEdit({ ...edit, cost: e.target.value.replace(/[^\d.]/g, '') })} style={{ marginTop: 4 }} />
              </label>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-3)', marginTop: 10 }}>Last time you did it
                <input className="input" type="date" value={edit.last || ''} max={iso()} onChange={(e) => setEdit({ ...edit, last: e.target.value || null })} style={{ marginTop: 4 }} />
              </label>
              <button className="btn-primary" style={{ width: '100%', marginTop: 14 }} onClick={() => {
                if (!edit.name.trim()) return;
                const clean = { ...edit, id: edit.id || genId(), name: edit.name.trim().slice(0, 40), every: Math.max(1, Number(edit.every) || 30), cost: Math.max(0, Number(edit.cost) || 0) };
                save(edit.id ? items.map((x) => (x.id === edit.id ? clean : x)) : [...items, clean]); setEdit(null);
              }}>Save</button>
              {edit.id && <button className="btn-ghost" style={{ width: '100%', marginTop: 8, color: 'var(--red)' }} onClick={() => { save(items.filter((x) => x.id !== edit.id)); setEdit(null); }}>Remove</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FirstTimes({ city }) {
  const [list, setList] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { getSetting('first_times', null).then((v) => setList(Array.isArray(v) && v.length ? v : FIRSTS.map((name) => ({ id: genId(), name })))).catch(() => setList([])); }, []);
  // Only the six newest look-ups are kept in full (each is a page of text); older ones keep just their name and tick.
  const save = (next) => {
    const fresh = new Set([...next].filter((x) => x.found).sort((a, b) => String(b.found.at).localeCompare(String(a.found.at))).slice(0, 6).map((x) => x.id));
    const lean = next.slice(0, 40).map((x) => (x.found && !fresh.has(x.id) ? { id: x.id, name: x.name, done: x.done || null } : x));
    setList(lean); setSetting('first_times', lean).catch(() => {});
  };
  if (!list) return null;

  const find = async (it) => {
    setBusy(it.id); setErr('');
    try {
      const r = await fetch('/api/life', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'find', thing: it.name, city }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not look it up.');
      save(list.map((x) => (x.id === it.id ? { ...x, found: j, open: true } : x)));
    } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };
  const add = () => { const name = text.trim().slice(0, 40); if (!name) return; save([{ id: genId(), name }, ...list]); setText(''); };
  const done = list.filter((x) => x.done).length;
  const order = [...list].sort((a, b) => Number(!!a.done) - Number(!!b.done));

  return (
    <div className="card" style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline' }}><div style={{ ...label, flex: 1 }}>First times</div><span className="font-num" style={{ fontSize: 12, color: 'var(--text-3)' }}>{done} done</span></div>
      <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.5 }}>Things you have never had or done. Luxe finds where{city ? ` in ${city}` : ''} and what it costs.</div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <input className="input" style={{ flex: 1 }} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Add something you have never tried" />
        <button className="btn-primary" style={{ width: 'auto', padding: '0 14px' }} onClick={add}>Add</button>
      </div>
      {err && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 8 }}>{err}</div>}
      {!city && <div style={{ fontSize: 12, color: '#F59E0B', marginTop: 8 }}>Set your location in the Planner (weather card) so Luxe searches the right town.</div>}

      {order.map((it) => (
        <div key={it.id} style={{ borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 10, opacity: it.done ? 0.6 : 1 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={!!it.done} onChange={() => save(list.map((x) => (x.id === it.id ? { ...x, done: x.done ? null : iso() } : x)))} style={{ width: 18, height: 18 }} aria-label={`Done ${it.name}`} />
            <button type="button" onClick={() => save(list.map((x) => (x.id === it.id ? { ...x, open: !x.open } : x)))} style={{ all: 'unset', cursor: 'pointer', flex: 1, fontSize: 14, fontWeight: 700, textDecoration: it.done ? 'line-through' : 'none' }}>{it.name}{it.done ? <span style={{ fontWeight: 500, fontSize: 12, color: 'var(--text-3)' }}> · {nice(it.done)}</span> : null}</button>
            {!it.done && <button className="btn-ghost" style={{ width: 'auto', padding: '5px 10px', fontSize: 12 }} disabled={!!busy || !city} onClick={() => find(it)}>{busy === it.id ? 'Looking…' : it.found ? '↻' : 'Find it'}</button>}
            <button className="btn-icon" aria-label={`Remove ${it.name}`} onClick={() => save(list.filter((x) => x.id !== it.id))}>✕</button>
          </div>
          {it.open && it.found && (
            <div style={box}>
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>{it.found.what}</div>
              {it.found.places?.map((p, i) => (
                <div key={i} style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{p.name}{p.area ? <span style={{ fontWeight: 500, color: 'var(--text-3)' }}> · {p.area}</span> : null}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{[p.price && p.price !== 'not stated' ? p.price : null, p.note].filter(Boolean).join(' · ')}</div>
                  <a href={`https://www.google.com/maps/search/${encodeURIComponent(`${p.name} ${it.found.city}`)}`} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent)' }}>Open in Maps ↗</a>
                </div>
              ))}
              {!it.found.places?.length && <a href={`https://www.google.com/maps/search/${encodeURIComponent(`${it.name} ${it.found.city}`)}`} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--accent)' }}>Search Maps for {it.name} ↗</a>}
              {it.found.expect_to_pay && <div style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.5 }}><b>Expect to pay:</b> {it.found.expect_to_pay}</div>}
              {it.found.first_time && <div style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.5 }}><b>First time:</b> {it.found.first_time}</div>}
              {it.found.cheaper_way && <div style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.5, color: 'var(--text-2)' }}><b>Cheaper way:</b> {it.found.cheaper_way}</div>}
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>From a web search on {nice(String(it.found.at).slice(0, 10))}. Check the price before you go.</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DayOut({ city, floating }) {
  const [plan, setPlan] = useState(null);
  const [budget, setBudget] = useState('');
  const [mood, setMood] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const suggest = Math.max(0, Math.floor((Math.max(0, Number(floating) || 0) * 0.2) / 50) * 50);
  useEffect(() => { getSetting('living_day', null).then((v) => { if (v?.day === iso() && v.out) setPlan(v.out); }).catch(() => {}); }, []);
  useEffect(() => { if (!budget && suggest >= 200) setBudget(String(suggest)); }, [suggest]); // eslint-disable-line react-hooks/exhaustive-deps
  const keep = async (out) => { const cur = (await getSetting('living_day', null).catch(() => null)) || {}; await setSetting('living_day', { ...(cur.day === iso() ? cur : {}), day: iso(), out }); };
  const make = async () => {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/life', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'day_out', city, budget: Number(String(budget).replace(/[^\d.]/g, '')), mood, day: new Date().toLocaleDateString('en-GB', { weekday: 'long' }) }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not plan it.');
      setPlan(j); keep(j).catch(() => {});
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="card" style={card}>
      <div style={label}>A day out, by yourself</div>
      {!plan ? (
        <>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.5 }}>In the mood to get out? Luxe plans the whole day{city ? ` in ${city}` : ''} inside what you can spend{suggest >= 200 ? <> (about <b>{kes(suggest)}</b> is comfortable today: a fifth of your free cash)</> : ''}.</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <input className="input" style={{ flex: 1 }} inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Budget for the day, KSh" />
            <button className="btn-primary" style={{ width: 'auto', padding: '0 14px' }} disabled={busy || !city} onClick={make}>{busy ? 'Planning…' : 'Plan my day'}</button>
          </div>
          <input className="input" style={{ marginTop: 6 }} value={mood} onChange={(e) => setMood(e.target.value)} placeholder="Optional: the mood (quiet, food, nature, somewhere lively, new places)" />
          {err && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 6 }}>{err}</div>}
        </>
      ) : (
        <>
          <div style={{ fontSize: 15, fontWeight: 800, marginTop: 6 }}>{plan.title || 'Your day out'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{kes(plan.total)} of {kes(plan.budget)}</div>
          {plan.stops.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <b className="font-num" style={{ minWidth: 68, fontSize: 12.5 }}>{fmt12(s.time)}</b>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.35 }}>{s.what}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{[s.place, s.cost ? kes(s.cost) : 'free'].filter(Boolean).join(' · ')}</div>
                {s.solo && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2, lineHeight: 1.45 }}>{s.solo}</div>}
                {s.place && <a href={`https://www.google.com/maps/search/${encodeURIComponent(`${s.place} ${plan.city}`)}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>Maps ↗</a>}
              </div>
            </div>
          ))}
          <div style={box}>
            {plan.eat && <div style={{ fontSize: 12.5, lineHeight: 1.5 }}><b>Eat:</b> {plan.eat}</div>}
            {plan.bring?.length > 0 && <div style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 4 }}><b>Bring:</b> {plan.bring.join(', ')}</div>}
            {plan.if_it_rains && <div style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 4 }}><b>If it rains:</b> {plan.if_it_rains}</div>}
            {plan.one_new_thing && <div style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 4 }}><b>One new thing:</b> {plan.one_new_thing}</div>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>Places come from a web search just now. Check opening hours and prices before you set off.</div>
          <button className="btn-ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => { setPlan(null); keep(null).catch(() => {}); }}>Plan a different day</button>
        </>
      )}
      {!city && <div style={{ fontSize: 12, color: '#F59E0B', marginTop: 8 }}>Set your location in the Planner (weather card) first.</div>}
    </div>
  );
}

function BuilderDay() {
  const [done, setDone] = useState({});
  useEffect(() => { getSetting('living_day', null).then((v) => { if (v?.day === iso() && v.builder) setDone(v.builder); }).catch(() => {}); }, []);
  const tick = async (k) => {
    const next = { ...done, [k]: !done[k] }; setDone(next);
    const cur = (await getSetting('living_day', null).catch(() => null)) || {};
    await setSetting('living_day', { ...(cur.day === iso() ? cur : {}), day: iso(), builder: next }).catch(() => {});
  };
  const n = BUILDER.filter(([k]) => done[k]).length;
  return (
    <div className="card" style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline' }}><div style={{ ...label, flex: 1 }}>Builder day</div><span className="font-num" style={{ fontSize: 12, color: n === 4 ? '#22C55E' : 'var(--text-3)' }}>{n}/4</span></div>
      <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.5 }}>A day that moves your future in tech forward: learn, build, ship, reach. About four hours in all. One of these a week is worth more than five busy days.</div>
      {BUILDER.map(([k, emoji, title, what, href, time]) => (
        <div key={k} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 10, opacity: done[k] ? 0.6 : 1 }}>
          <input type="checkbox" checked={!!done[k]} onChange={() => tick(k)} style={{ width: 18, height: 18, marginTop: 2 }} aria-label={`Done ${title}`} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>{emoji} {title} <span style={{ fontWeight: 500, fontSize: 12, color: 'var(--text-3)' }}>· {time}</span></div>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.45, marginTop: 2 }}>{what}</div>
          </div>
          <Link href={href} className="btn-ghost" style={{ width: 'auto', padding: '5px 10px', fontSize: 12, textDecoration: 'none' }}>Open</Link>
        </div>
      ))}
    </div>
  );
}

export default function Living() {
  const { floating } = useFloatingCash();
  const [city, setCity] = useState('');
  useEffect(() => { getHomeLocation().then((l) => setCity(l?.name ? String(l.name).split(',')[0] : '')).catch(() => {}); }, []);
  const hello = useMemo(() => { const h = new Date().getHours(); return h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening'; }, []);
  return (
    <Layout fab={false}>
      <Head><title>Live a little · Luxe</title></Head>
      <div style={{ padding: '12px 16px 90px', maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: '4px 0 4px' }}>🌤 Live a little</h1>
        <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 14 }}>{hello}. Money is for living too: what is coming up, something you have never tried, and a day that is yours.</div>
        <Upkeep />
        <FirstTimes city={city} />
        <DayOut city={city} floating={floating} />
        <BuilderDay />
        <Link href="/support" style={{ display: 'block', padding: '12px 14px', borderRadius: 12, background: 'var(--card-2)', color: 'var(--text-2)', textDecoration: 'none', fontSize: 13, lineHeight: 1.45 }}>
          <b style={{ color: 'var(--text)' }}>When it's heavy →</b><br />People to call, what to do in the next ten minutes, and your own plan for the dark hours.
        </Link>
      </div>
    </Layout>
  );
}
