import { useState } from 'react';

// Customers tab → "Where to find them" (pages/api/startup/leads.js). The AI says who your first customers are and
// what to search for; every link is built here from those search words, so each one opens a real search in the
// real app or site. Tick a place when you have worked it. Saved with the startup (startup.leads).
const enc = encodeURIComponent;
const LINK = {
  linkedin: (q) => `https://www.linkedin.com/search/results/people/?keywords=${enc(q)}`,
  facebook_groups: (q) => `https://www.facebook.com/search/groups/?q=${enc(q)}`,
  x: (q) => `https://x.com/search?q=${enc(q)}&f=live`,
  reddit: (q) => `https://www.reddit.com/search/?q=${enc(q)}`,
  google: (q) => `https://www.google.com/search?q=${enc(q)}`,
  maps: (q) => `https://www.google.com/maps/search/${enc(q)}`,
  in_person: (q) => `https://www.google.com/maps/search/${enc(q)}`,
  instagram: (q) => `https://www.google.com/search?q=${enc(`site:instagram.com ${q}`)}`,
  telegram: (q) => `https://www.google.com/search?q=${enc(`site:t.me ${q}`)}`,
  tiktok: (q) => `https://www.tiktok.com/search?q=${enc(q)}`,
  youtube: (q) => `https://www.youtube.com/results?search_query=${enc(q)}`,
  events: (q) => `https://www.google.com/search?q=${enc(`${q} event OR meetup`)}`,
};
const NAME = { linkedin: ['💼', 'LinkedIn'], facebook_groups: ['👥', 'Facebook groups'], x: ['𝕏', 'X'], reddit: ['👽', 'Reddit'], google: ['🔎', 'Google'], maps: ['📍', 'Google Maps'], in_person: ['🚶', 'Go there'], instagram: ['📸', 'Instagram'], telegram: ['✈️', 'Telegram'], tiktok: ['🎵', 'TikTok'], youtube: ['▶️', 'YouTube'], events: ['🎟️', 'Events'] };

export default function LeadFinder({ startup, save, pipeline = 0, paying = 0 }) {
  const leads = startup.leads || null;
  const [where, setWhere] = useState(leads?.where || 'Kenya');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  const find = async () => {
    setBusy(true); setErr('');
    try {
      const st = startup.stages || {};
      const r = await fetch('/api/startup/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ where, startup: { name: startup.name, mission: startup.mission, problem: st.ideation?.problem, solution: st.ideation?.solution, customer: st.mvp?.target_users || st.ideation?.validation, stage: startup.current_stage || startup.stage, pipeline, paying, price: startup.price } }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not work it out.');
      save({ leads: { ...j, done: {} } });
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const tick = (i) => save({ leads: { ...leads, done: { ...(leads.done || {}), [i]: !leads.done?.[i] } } });
  const copy = async () => { try { await navigator.clipboard.writeText(leads.opener); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* no clipboard */ } };
  const worked = leads ? Object.values(leads.done || {}).filter(Boolean).length : 0;

  return (
    <section className="card muse-card">
      <div className="muse-label">🧲 WHERE TO FIND THEM</div>
      <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.5 }}>
        {leads ? leads.who : 'The exact places your first customers already gather, what to search for in each, and a first message to send. Each button opens the real search.'}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <input className="input" style={{ flex: 1 }} value={where} onChange={(e) => setWhere(e.target.value)} placeholder="Where are your customers? e.g. Eldoret, Kenya" />
        <button className="btn-primary" style={{ width: 'auto', padding: '0 14px' }} disabled={busy} onClick={find}>{busy ? 'Looking…' : leads ? '↻ Again' : 'Find them'}</button>
      </div>
      {err && <div style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 8 }}>{err}</div>}

      {leads && (
        <>
          {leads.today?.length > 0 && (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.25)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: '#22C55E' }}>DO THESE THREE TODAY</div>
              {leads.today.map((x, i) => <div key={i} style={{ fontSize: 13, marginTop: 6, lineHeight: 1.45 }}><b>{i + 1}.</b> {x}</div>)}
            </div>
          )}
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '14px 0 4px' }}>{worked} of {leads.places.length} places worked</div>
          {leads.places.map((p, i) => {
            const [icon, name] = NAME[p.kind] || NAME.google;
            const done = !!leads.done?.[i];
            return (
              <div key={i} style={{ padding: '10px 0', borderTop: '1px solid var(--border)', opacity: done ? 0.55 : 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={done} onChange={() => tick(i)} aria-label={`Worked ${p.label}`} style={{ marginTop: 3 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{icon} {p.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2, lineHeight: 1.45 }}>{p.why}</div>
                    {p.do && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.45 }}>→ {p.do}</div>}
                    <a href={(LINK[p.kind] || LINK.google)(p.search)} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none', padding: '5px 10px', borderRadius: 8, background: 'var(--accent-dim)' }}>Open {name}: “{p.search}” ↗</a>
                  </div>
                </div>
              </div>
            );
          })}
          {leads.opener && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: 'var(--card-2)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline' }}><div style={{ flex: 1, fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: 'var(--text-3)' }}>A FIRST MESSAGE TO SEND</div><button className="btn-ghost" style={{ width: 'auto', padding: '3px 10px', fontSize: 12 }} onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button></div>
              <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>{leads.opener}</div>
            </div>
          )}
          {leads.avoid && <div style={{ fontSize: 12, color: '#F59E0B', marginTop: 10, lineHeight: 1.45 }}>⚠ {leads.avoid}</div>}
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>When someone replies, add them below as a lead so Luxe follows them up.</div>
        </>
      )}
    </section>
  );
}
