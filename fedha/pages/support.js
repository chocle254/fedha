import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Layout from '../components/Layout';

// When it's heavy: for the days the thoughts get dark. People to call (checked 11 Nov 2026), what to do in the
// next ten minutes, a personal safety plan in your own words, and plain facts about low mood.
// Nothing here is a cure and Luxe is not a counsellor: the page says so, and points at people who are.
// The safety plan stays on this phone only (localStorage 'luxe_safety_plan'); it is never sent to the server.
const LINES = [
  { name: 'Befrienders Kenya', num: '+254722178177', show: '0722 178 177', note: 'People trained to listen to exactly this. Free, confidential, no judgement.' },
  { name: 'Kenya Red Cross counselling', num: '1199', show: '1199', note: 'Free to call, day and night.' },
  { name: 'Emergency', num: '999', show: '999 or 112', note: 'If you are about to hurt yourself or already have.' },
];
const NOW = [
  ['Do not be alone with it', 'Call one of the numbers above, or sit in the same room as someone at home. You do not have to explain everything. "I am not okay tonight" is enough.'],
  ['Put ten minutes between you and the thought', 'The strongest part of the urge passes, usually within minutes to an hour. Decide nothing tonight. Tell yourself: not now, I will look at this again tomorrow.'],
  ['Make the room safer', 'Move anything you could hurt yourself with out of reach, or give it to someone to keep. Distance is what gets people through the worst minutes.'],
  ['Do not add to it', 'Alcohol and weed feel like relief, but when the mood is already dark they usually make the thoughts louder afterwards. Leave them for another night.'],
  ['Bring the body down', 'Cold water on your face. Then breathe in for 4, hold for 4, out for 6, ten times. Name five things you can see. It sounds small; it changes what your body is doing.'],
];
const FACTS = [
  ['It is an illness, not who you are', 'Depression changes how the brain weighs things: it makes the bad look permanent and the good look fake. The thought "it will always be like this" is a symptom, not a fact about your life.'],
  ['The basics move it more than they should', 'Sleep at about the same time, daylight in the morning, and moving your body most days each shift mood measurably. None of them fixes it alone. Together they make everything else work better.'],
  ['Being alone a lot makes it heavier', 'Liking your own company is fine. Going days without talking to anyone feeds it. One small contact a day counts: a message, a short call, greeting the shopkeeper.'],
  ['It is treatable', 'Talking therapy and, for some people, medicine work for most who try them. A clinical officer or doctor at your nearest county hospital can assess you; public clinics charge little. Thoughts of suicide are a reason to go this week, not a reason to wait.'],
];
const PLAN = [
  ['signs', 'My warning signs', 'What it looks like when I am sliding (not sleeping, not eating, staying in bed, a certain thought…)'],
  ['helps', 'What helps me, on my own', 'Music, a walk, a shower, a series, cooking, writing it down…'],
  ['places', 'Places and people that take my mind off it', 'Somewhere with people around, a relative\'s house, a friend…'],
  ['people', 'People I can tell, and their numbers', 'Name and number. One is enough.'],
  ['reasons', 'My reasons to stay', 'People, plans, things I have not done yet, what I am building…'],
];
const KEY = 'luxe_safety_plan';

export default function Support() {
  const [plan, setPlan] = useState({});
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(null);
  useEffect(() => { try { setPlan(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* private mode */ } }, []);
  const edit = (k, v) => { const n = { ...plan, [k]: v }; setPlan(n); try { localStorage.setItem(KEY, JSON.stringify(n)); setSaved(true); setTimeout(() => setSaved(false), 1500); } catch { /* private mode */ } };

  const card = { padding: 16, marginBottom: 12 };
  const label = { fontSize: 11, fontWeight: 800, letterSpacing: 0.8, color: 'var(--text-3)', textTransform: 'uppercase' };
  return (
    <Layout fab={false}>
      <Head><title>When it's heavy · Luxe</title></Head>
      <div style={{ padding: '12px 16px 90px', maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: '4px 0 6px' }}>When it's heavy</h1>
        <div style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.55, marginBottom: 14 }}>
          Thoughts of ending your life are more common than people admit, and they pass, even when it does not feel like it. You do not have to carry them by yourself tonight.
        </div>

        <div className="card" style={{ ...card, borderColor: 'rgba(125,211,252,.45)', background: 'rgba(125,211,252,.07)' }}>
          <div style={label}>Talk to a person now</div>
          {LINES.map((l) => (
            <a key={l.num} href={`tel:${l.num}`} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 14px', marginTop: 8, borderRadius: 12, background: 'var(--card-2)', color: 'var(--text)', textDecoration: 'none' }}>
              <span style={{ fontSize: 22 }}>📞</span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800 }}>{l.name} · <span className="font-num">{l.show}</span></span>
                <span style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.4 }}>{l.note}</span>
              </span>
            </a>
          ))}
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8 }}>Tap a number to call it. Numbers checked 11 Nov 2026.</div>
        </div>

        <div className="card" style={card}>
          <div style={label}>The next ten minutes</div>
          {NOW.map(([t, d], i) => (
            <div key={t} style={{ marginTop: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{i + 1}. {t}</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55, marginTop: 2 }}>{d}</div>
            </div>
          ))}
        </div>

        <div className="card" style={card}>
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <div style={{ ...label, flex: 1 }}>My plan for the dark hours</div>
            {saved && <span style={{ fontSize: 11.5, color: '#22C55E' }}>Saved on this phone</span>}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5, marginTop: 4 }}>Write it on a day when you feel steadier. On a bad night you only have to read it and follow it, one line at a time. It stays on this phone and nowhere else.</div>
          {PLAN.map(([k, title, hint]) => (
            <label key={k} style={{ display: 'block', marginTop: 12, fontSize: 13, fontWeight: 700 }}>{title}
              <textarea className="input" rows={2} value={plan[k] || ''} onChange={(e) => edit(k, e.target.value)} placeholder={hint} style={{ marginTop: 5, fontWeight: 400, lineHeight: 1.45 }} />
            </label>
          ))}
        </div>

        <div className="card" style={card}>
          <div style={label}>What depression is doing</div>
          {FACTS.map(([t, d], i) => (
            <div key={t} style={{ borderTop: i ? '1px solid var(--border)' : 0, marginTop: i ? 10 : 6, paddingTop: i ? 10 : 0 }}>
              <button type="button" onClick={() => setOpen(open === i ? null : i)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', width: '100%', fontSize: 14, fontWeight: 700 }}><span style={{ flex: 1 }}>{t}</span><span style={{ color: 'var(--text-3)' }}>{open === i ? '−' : '+'}</span></button>
              {open === i && <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55, marginTop: 6 }}>{d}</div>}
            </div>
          ))}
        </div>

        <div className="card" style={card}>
          <div style={label}>Small things in Luxe that help</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <Link href="/planner" className="btn-ghost" style={{ width: 'auto', padding: '8px 12px', textDecoration: 'none' }}>🫧 Low day in the Planner</Link>
            <Link href="/living" className="btn-ghost" style={{ width: 'auto', padding: '8px 12px', textDecoration: 'none' }}>🌤 Something to look forward to</Link>
            <Link href="/music" className="btn-ghost" style={{ width: 'auto', padding: '8px 12px', textDecoration: 'none' }}>🎵 Music</Link>
          </div>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.55, padding: '0 4px' }}>
          Luxe is an app, not a counsellor, and this page cannot treat depression. It is here so the numbers and your own plan are one tap away. The thoughts going away for good is the work of people: someone to talk to, and a clinic if you can get to one.
        </div>
      </div>
    </Layout>
  );
}
