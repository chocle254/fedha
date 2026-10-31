import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { getSetting, setSetting } from '../lib/db';
import { birthdayInfo } from '../lib/holidays';
import { tierFor } from '../lib/wealth-tiers';
import { interestEarned } from '../lib/ziidi';
import { loadAll, record, levelOf, rankOf } from '../lib/study';
import { fireConfetti } from '../lib/confetti';
import { speak, stopSpeaking } from '../lib/voice';
import { formatShort } from '../lib/utils';
import Md from './learn/Md';

// The Birthday Hub (5 December): a letter Luxe writes from your real year (opens on the day, like an envelope),
// three gift boxes (+250 study XP, the birthday look for a week, one wish turned into a savings goal after you
// confirm), an AI birthday plan that fits your budget and goes straight into that day's planner, and a wish list.
// One small settings record per year: 'bday_<year>' = { wishes, letter, plan, opened, seen }.
const TABS = [['letter', '💌 Letter'], ['gifts', '🎁 Gifts'], ['plan', '🗓️ Plan'], ['wishes', '⭐ Wishes']];
const nth = (n) => { const v = n % 100; return n + (v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'); };
const plusDays = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export default function BirthdayHub({ onClose, startTab }) {
  const app = useApp();
  const { transactions = [], courses = [], certificates = [], goals = [], hackathons = [], netWorth = 0, totalBalance = 0, addGoal } = app;
  const b = birthdayInfo();
  const KEY = `bday_${b.year}`;
  const [rec, setRec] = useState({ wishes: [], letter: '', plan: null, opened: {} });
  const [tab, setTab] = useState(startTab || (b.isToday ? 'letter' : 'plan'));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [envOpen, setEnvOpen] = useState(false);
  const [shake, setShake] = useState(null);
  const [wish, setWish] = useState({ text: '', price: '' });
  const [budget, setBudget] = useState('');
  const [likes, setLikes] = useState('');
  const [added, setAdded] = useState(false);

  useEffect(() => { getSetting(KEY, null).then((r) => r && setRec({ wishes: [], opened: {}, ...r })); }, [KEY]);
  useEffect(() => () => stopSpeaking(), []);
  const save = async (next) => { setRec(next); await setSetting(KEY, next); };

  // The facts the letter is written from: only what Luxe actually knows about your year.
  const facts = useMemo(() => {
    const since = new Date(); since.setFullYear(since.getFullYear() - 1);
    const s0 = since.toISOString().slice(0, 10);
    const year = transactions.filter((t) => (t.date || '') >= s0);
    const income = year.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount || 0), 0);
    const tier = tierFor(netWorth);
    const done = courses.filter((c) => c.status === 'completed' && (c.completed_at || '') >= s0);
    const certs = certificates.filter((c) => (c.date_earned || c.created_at || '') >= s0);
    const savedGoals = goals.reduce((s, g) => s + Number(g.current || 0), 0);
    const hit = goals.filter((g) => Number(g.target) > 0 && Number(g.current) >= Number(g.target));
    const out = [
      `Net worth now: KSh ${Math.round(netWorth).toLocaleString()} (${tier.name} tier)`,
      income > 0 && `Money in over the past year: KSh ${Math.round(income).toLocaleString()} across ${year.filter((t) => t.type === 'income').length} payments`,
      savedGoals > 0 && `Saved into goals: KSh ${Math.round(savedGoals).toLocaleString()} across ${goals.length} goals${hit.length ? `, ${hit.length} fully reached` : ''}`,
      interestEarned(transactions) > 0 && `Ziidi interest earned: KSh ${interestEarned(transactions).toFixed(2)}`,
      done.length && `Courses finished this year: ${done.map((c) => c.title).slice(0, 5).join(', ')}`,
      courses.filter((c) => c.status !== 'completed').length && `Still studying: ${courses.filter((c) => c.status !== 'completed').map((c) => c.title).slice(0, 4).join(', ')}`,
      certs.length && `Certificates earned: ${certs.length}`,
      hackathons.length && `Hackathons joined: ${hackathons.length}`,
    ];
    return out.filter(Boolean);
  }, [transactions, courses, certificates, goals, hackathons, netWorth]);

  const writeLetter = async () => {
    setBusy(true); setErr('');
    try {
      const st = await loadAll();
      const lv = levelOf(st.stats.xp);
      const study = [`Learning level ${lv.level} (${rankOf(lv.level)}), ${st.stats.xp} XP, best study streak ${st.stats.best_streak} days, ${Math.round((st.stats.counts.focus_min || 0) / 60)} focus hours`, st.stats.counts.projects_done ? `Projects shipped: ${st.stats.counts.projects_done}` : null].filter(Boolean);
      const r = await fetch('/api/celebrate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'letter', age: b.age, facts: [...facts, ...study] }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Could not write the letter.');
      await save({ ...rec, letter: j.letter });
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  useEffect(() => { if (b.isToday && tab === 'letter' && envOpen && !rec.letter && !busy) writeLetter(); }, [envOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const openGift = async (k) => {
    if (!b.isToday) { setShake(k); setTimeout(() => setShake(null), 600); return; }
    if (rec.opened?.[k]) return;
    if (k === 'xp') { try { const st = await loadAll(); await record(st, { kind: 'gift', topic: 'Birthday gift', xp: 250 }); } catch { /* still opened */ } }
    if (k === 'glow') { try { localStorage.setItem('luxe_bday_glow_until', plusDays(b.iso, 7)); } catch { /* private */ } }
    if (k === 'wish') {
      const w = rec.wishes[0];
      if (!w) { setTab('wishes'); setErr('Add a wish first, then open this gift.'); return; }
      const pick = rec.wishes.length > 1 ? window.prompt(`Which wish? ${rec.wishes.map((x, i) => `${i + 1}. ${x.text}`).join('  ')}`, '1') : '1';
      const chosen = rec.wishes[Math.max(0, Math.min(rec.wishes.length - 1, (Number(pick) || 1) - 1))];
      if (!chosen || !window.confirm(`Make "${chosen.text}" a savings goal${chosen.price ? ` of KSh ${Number(chosen.price).toLocaleString()}` : ''}? Nothing moves until you save into it.`)) return;
      await addGoal?.({ name: `🎁 ${chosen.text}`, target: Number(chosen.price) || 1000, current: 0, icon: '🎁', color: '#EC4899', deadline: plusDays(b.iso, 120) });
    }
    fireConfetti();
    await save({ ...rec, opened: { ...(rec.opened || {}), [k]: true } });
  };

  const makePlan = async () => {
    setBusy(true); setErr(''); setAdded(false);
    try {
      const r = await fetch('/api/celebrate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'plan', age: b.age, budget: Number(budget) || Math.round(Math.max(500, Math.min(5000, totalBalance * 0.1)) / 100) * 100, wishes: rec.wishes.map((w) => w.text), likes }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Could not plan the day.');
      await save({ ...rec, plan: j.plan });
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const addToPlanner = async () => {
    const key = `planner_fun_${b.iso}`;
    const cur = (await getSetting(key, [])) || [];
    const blocks = rec.plan.items.map((x, i) => ({ id: `bday_${b.year}_${i}`, fun: true, pinned: true, type: 'personal', emoji: x.emoji, time: x.time, duration: x.minutes, label: x.title, note: [x.cost ? `~KSh ${x.cost.toLocaleString()}` : 'Free', x.note].filter(Boolean).join(' · ') }));
    await setSetting(key, [...cur.filter((x) => !String(x.id).startsWith(`bday_${b.year}_`)), ...blocks]);
    setAdded(true);
  };

  const GIFTS = [['xp', '🎓', '+250 study XP', 'Straight onto your Learning level.'], ['glow', '✨', 'Birthday week', 'The birthday look stays on for 7 more days.'], ['wish', '🌠', 'A wish granted', 'One of your wishes becomes a savings goal.']];

  return (
    <div className="bh-overlay" role="dialog" aria-label="Birthday">
      <div className="bh-sheet">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 30 }}>🎂</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 17 }}>{b.isToday ? `Happy ${nth(b.age)} birthday!` : `Your ${nth(b.age)} birthday`}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{b.isToday ? 'Today is yours. Open everything.' : `In ${b.days} day${b.days === 1 ? '' : 's'} · 5 December`}</div>
          </div>
          <button className="btn-icon" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="tab-scroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '14px 0' }}>
          {TABS.map(([k, l]) => <button key={k} className={`chip ${tab === k ? 'active' : ''}`} onClick={() => { setTab(k); setErr(''); }}>{l}</button>)}
        </div>
        {err && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 10 }}>{err}</div>}

        {tab === 'letter' && (!b.isToday ? (
          <div className="bh-envelope bh-locked"><div className="bh-flap" /><div className="bh-seal">🔒</div><div className="bh-env-text">A letter from Luxe<br /><b>Opens in {b.days} day{b.days === 1 ? '' : 's'}</b></div></div>
        ) : !envOpen && !rec.letter ? (
          <button onClick={() => { setEnvOpen(true); fireConfetti(); }} aria-label="Open your birthday letter" style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
            <div className="bh-envelope"><div className="bh-flap" /><div className="bh-seal">💌</div><div className="bh-env-text">A letter from Luxe<br /><b>Tap to open</b></div></div>
          </button>
        ) : (
          <div className="bh-letter">
            {busy && !rec.letter ? <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Luxe is writing your letter, looking back at your year…</div> : <Md text={rec.letter} style={{ fontSize: 14, lineHeight: 1.7 }} />}
            {rec.letter && <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              <button className="btn-ghost" onClick={() => speak(rec.letter.replace(/[#*>-]/g, ''), { style: 'concierge' })}>🔊 Read it to me</button>
              <button className="btn-ghost" disabled={busy} onClick={writeLetter}>↻ Rewrite</button>
            </div>}
          </div>
        ))}

        {tab === 'gifts' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            {GIFTS.map(([k, icon, title, sub]) => {
              const open = rec.opened?.[k];
              return (
                <button key={k} onClick={() => openGift(k)} className={`bh-gift ${open ? 'bh-open' : ''} ${shake === k ? 'bh-shake' : ''}`}>
                  <div className="bh-box">{open ? icon : '🎁'}</div>
                  <div style={{ fontSize: 12, fontWeight: 800, marginTop: 6 }}>{open ? title : b.isToday ? 'Tap to open' : `${b.days}d`}</div>
                  {open && <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.35 }}>{sub}</div>}
                </button>
              );
            })}
            {!b.isToday && <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>No peeking. They open on 5 December.</div>}
          </div>
        )}

        {tab === 'plan' && (
          <div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="input font-num" type="number" min="0" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder={`Budget (KSh), e.g. ${Math.round(Math.max(500, Math.min(5000, totalBalance * 0.1)) / 100) * 100}`} />
              <button className="btn-primary" disabled={busy} onClick={makePlan}>{busy ? '…' : rec.plan ? '↻ Replan' : '✨ Plan it'}</button>
            </div>
            <input className="input" style={{ marginTop: 8 }} value={likes} onChange={(e) => setLikes(e.target.value)} placeholder="What would make it great? (food, places, people, adventure…)" />
            {rec.plan && (
              <div className="card-2" style={{ padding: 12, marginTop: 12 }}>
                <div style={{ fontWeight: 800 }}>{rec.plan.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>About KSh {Number(rec.plan.budget || 0).toLocaleString()} in total</div>
                {rec.plan.items.map((x, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 0', borderTop: i ? '1px solid var(--border)' : 0 }}>
                    <div className="font-num" style={{ fontSize: 12, color: 'var(--text-3)', width: 40 }}>{x.time}</div>
                    <div style={{ fontSize: 18 }}>{x.emoji}</div>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700 }}>{x.title}</div><div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{x.cost ? `~KSh ${x.cost.toLocaleString()} · ` : 'Free · '}{x.note}</div></div>
                  </div>
                ))}
                <button className="btn-primary" style={{ width: '100%', marginTop: 10 }} disabled={added} onClick={addToPlanner}>{added ? '✓ In your planner for 5 Dec' : '📅 Put it in my planner for the day'}</button>
              </div>
            )}
          </div>
        )}

        {tab === 'wishes' && (
          <div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="input" value={wish.text} onChange={(e) => setWish({ ...wish, text: e.target.value })} placeholder="I wish for… (a laptop, a trip, a course)" />
              <input className="input font-num" style={{ width: 100 }} type="number" value={wish.price} onChange={(e) => setWish({ ...wish, price: e.target.value })} placeholder="KSh" />
            </div>
            <button className="btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={!wish.text.trim()} onClick={async () => { await save({ ...rec, wishes: [...rec.wishes, { id: Date.now(), text: wish.text.trim().slice(0, 80), price: Number(wish.price) || 0 }].slice(0, 15) }); setWish({ text: '', price: '' }); }}>⭐ Add wish</button>
            {rec.wishes.map((w) => (
              <div key={w.id} className="card-2" style={{ padding: 10, marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>⭐</span><span style={{ flex: 1, fontSize: 13 }}>{w.text}</span>{w.price ? <span className="font-num" style={{ fontSize: 12, color: 'var(--text-3)' }}>{formatShort(w.price, 'KES')}</span> : null}
                <button className="btn-icon" aria-label="Remove wish" onClick={() => save({ ...rec, wishes: rec.wishes.filter((x) => x.id !== w.id) })}>✕</button>
              </div>
            ))}
            {!rec.wishes.length && <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 10, textAlign: 'center' }}>Your wishes shape the birthday plan, and one gift turns a wish into a savings goal.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
