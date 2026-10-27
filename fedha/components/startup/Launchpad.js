import { useEffect, useMemo, useState } from 'react';
import { PROGRAMS, PROGRAM_TYPES, REGIONS, SORTS } from '../../lib/startup-programs';
import { getSetting, setSetting } from '../../lib/db';

const TYPE_EMOJI = { Accelerator: '🚀', Incubator: '🐣', Fellowship: '🎓', Grant: '💸', Credits: '☁️', Community: '👥', Competition: '🏆' };
const pill = (on) => ({ padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, border: `1px solid ${on ? 'var(--green)' : 'var(--border)'}`, background: on ? 'var(--green-dim)' : 'transparent', color: on ? 'var(--green)' : 'var(--text-2)', cursor: 'pointer', whiteSpace: 'nowrap' });

async function askAI(body) {
  const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || 'Search failed. Try again.');
  return j.results || [];
}

// Startup Launchpad: where to apply (directory + live open calls) and what to build (researched ideas).
export default function Launchpad({ onStartIdea }) {
  const [view, setView] = useState('programs');
  const [region, setRegion] = useState('All');
  const [type, setType] = useState('All');
  const [sort, setSort] = useState('fit');
  const [q, setQ] = useState('');
  const [freeOnly, setFreeOnly] = useState(false);
  const [live, setLive] = useState(null);
  const [liveBusy, setLiveBusy] = useState(false);
  const [ideas, setIdeas] = useState(null);
  const [interests, setInterests] = useState('fintech, trading tools, AI for small businesses, Kenya / Africa, developer tools');
  const [ideaBusy, setIdeaBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState([]);

  useEffect(() => {
    (async () => {
      setLive(await getSetting('launchpad_live', null));
      setIdeas(await getSetting('launchpad_ideas', null));
      setSaved((await getSetting('launchpad_saved', [])) || []);
      const i = await getSetting('launchpad_interests', null);
      if (i) setInterests(i);
    })();
  }, []);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return PROGRAMS
      .filter((p) => region === 'All' || p.region === region)
      .filter((p) => type === 'All' || p.type === type)
      .filter((p) => !freeOnly || !p.equity)
      .filter((p) => !term || `${p.name} ${p.note} ${p.mode}`.toLowerCase().includes(term))
      .sort(SORTS[sort].fn);
  }, [region, type, sort, q, freeOnly]);

  const toggleSave = async (name) => {
    const next = saved.includes(name) ? saved.filter((x) => x !== name) : [...saved, name];
    setSaved(next);
    await setSetting('launchpad_saved', next);
  };

  async function findOpen() {
    setLiveBusy(true); setErr('');
    try {
      const results = await askAI({ type: 'startup_programs', region, nonce: Date.now() });
      const data = { at: new Date().toISOString(), region, results };
      setLive(data);
      await setSetting('launchpad_live', data);
    } catch (e) { setErr(e.message); } finally { setLiveBusy(false); }
  }

  async function researchIdeas() {
    setIdeaBusy(true); setErr('');
    try {
      await setSetting('launchpad_interests', interests);
      const results = await askAI({ type: 'startup_ideas', interests, nonce: Date.now() });
      const data = { at: new Date().toISOString(), results: results.sort((a, b) => (b.fit || 0) - (a.fit || 0)) };
      setIdeas(data);
      await setSetting('launchpad_ideas', data);
    } catch (e) { setErr(e.message); } finally { setIdeaBusy(false); }
  }

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div className="section-title" style={{ marginBottom: 0, flex: 1 }}>Launchpad</div>
        <button style={pill(view === 'programs')} onClick={() => setView('programs')}>🚀 Where to apply</button>
        <button style={pill(view === 'ideas')} onClick={() => setView('ideas')}>💡 What to build</button>
      </div>
      {err && <div style={{ padding: '10px 14px', background: 'var(--red-dim)', borderRadius: 10, color: 'var(--red)', fontSize: 13, marginBottom: 10 }}>⚠ {err}</div>}

      {view === 'programs' && (
        <>
          {/* Live open calls */}
          <div className="card" style={{ padding: 14, marginBottom: 12, borderColor: 'rgba(16,185,129,.35)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Open right now</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                  {live ? `Searched ${new Date(live.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · ${live.region === 'All' ? 'worldwide' : live.region}` : 'Searches the web for accelerators and grants taking applications now, sorted by deadline.'}
                </div>
              </div>
              <button className="btn-primary" style={{ width: 'auto', padding: '9px 14px', fontSize: 13 }} disabled={liveBusy} onClick={findOpen}>{liveBusy ? 'Searching…' : live ? '↻ Refresh' : 'Find open calls'}</button>
            </div>
            {live?.results?.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {live.results.map((p, i) => (
                  <a key={i} href={p.url} target="_blank" rel="noreferrer" style={{ display: 'flex', gap: 10, padding: '10px 0', borderTop: '1px solid var(--border)', textDecoration: 'none', color: 'inherit' }}>
                    <span style={{ fontSize: 20 }}>{TYPE_EMOJI[p.type] || '🚀'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name} <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500 }}>· {p.type} · {p.region}</span></div>
                      <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{p.why_fit}</div>
                      {p.funding && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{p.funding}</div>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: p.status === 'Open' ? 'var(--green)' : '#F59E0B' }}>{p.status}</div>
                      {p.deadline && <div className="font-num" style={{ fontSize: 11, color: 'var(--text-3)' }}>closes {p.deadline}</div>}
                    </div>
                  </a>
                ))}
              </div>
            )}
            {live && !live.results?.length && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>Nothing open matched that search. Try another region.</div>}
          </div>

          {/* Filters */}
          <input className="input" placeholder="Search programs…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6 }}>
            {['All', ...REGIONS].map((r) => <button key={r} style={pill(region === r)} onClick={() => setRegion(r)}>{r}</button>)}
          </div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginTop: 4 }}>
            {['All', ...PROGRAM_TYPES].map((t) => <button key={t} style={pill(type === t)} onClick={() => setType(t)}>{t === 'All' ? 'All types' : `${TYPE_EMOJI[t]} ${t}`}</button>)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0 10px', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} /> No equity only</label>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Sort</span>
            <select className="input" style={{ width: 'auto', padding: '6px 10px', fontSize: 12 }} value={sort} onChange={(e) => setSort(e.target.value)}>
              {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>{list.length} program{list.length === 1 ? '' : 's'}{saved.length ? ` · ${saved.length} saved ★` : ''}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
            {list.map((p) => (
              <div key={p.name} className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ fontSize: 22 }}>{TYPE_EMOJI[p.type]}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{p.type} · {p.region} · {p.mode}</div>
                  </div>
                  <button onClick={() => toggleSave(p.name)} aria-label="Save" style={{ background: 'none', border: 0, fontSize: 18, cursor: 'pointer', color: saved.includes(p.name) ? '#F59E0B' : 'var(--text-3)' }}>★</button>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>{p.note}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                  <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: p.equity ? 'rgba(245,158,11,.12)' : 'var(--green-dim)', color: p.equity ? '#F59E0B' : 'var(--green)' }}>{p.funding}</span>
                  <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: 'var(--card-2)', color: 'var(--text-2)' }}>{p.stage}</span>
                  {p.solo && <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: 'var(--card-2)', color: 'var(--text-2)' }}>Solo OK</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', marginTop: 'auto', paddingTop: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-3)', flex: 1 }}>{p.cycle}</span>
                  <a href={p.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', textDecoration: 'none' }}>Apply / details →</a>
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5, marginTop: 10 }}>Terms and intake dates change every cycle, so always check the official site. "Best fit" puts solo-friendly, equity-free, Africa or remote, and early-stage programs first.</p>
        </>
      )}

      {view === 'ideas' && (
        <>
          <div className="card" style={{ padding: 14, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Research ideas from what&apos;s trending now</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>Searches the web for real trends and complaints, then suggests ideas you can start alone for under $100, scored for fit.</div>
            <textarea className="input" rows={2} value={interests} onChange={(e) => setInterests(e.target.value)} placeholder="Your interests and skills" />
            <button className="btn-primary" style={{ marginTop: 10 }} disabled={ideaBusy} onClick={researchIdeas}>{ideaBusy ? 'Researching (about 30s)…' : ideas ? '↻ Research new ideas' : 'Research ideas'}</button>
          </div>
          {ideas?.results?.map((idea, i) => (
            <div key={i} className="card" style={{ padding: 14, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: 24 }}>{idea.emoji || '💡'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{idea.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 3, lineHeight: 1.5 }}>{idea.problem}</div>
                </div>
                <div style={{ textAlign: 'center', flexShrink: 0 }}>
                  <div className="font-num" style={{ fontSize: 18, fontWeight: 800, color: idea.fit >= 8 ? 'var(--green)' : idea.fit >= 6 ? '#F59E0B' : 'var(--text-2)' }}>{idea.fit}/10</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)' }}>fit</div>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 6, marginTop: 10, fontSize: 12, lineHeight: 1.5 }}>
                {[['Solution', idea.solution], ['Who pays', idea.customer], ['Money', idea.revenue], ['Why now', idea.why_now], ['2-week MVP', idea.mvp], ['First 10 customers', idea.first_10_customers], ['Competitors', idea.competitors]].filter(([, v]) => v).map(([k, v]) => (
                  <div key={k}><span style={{ color: 'var(--text-3)' }}>{k}: </span><span style={{ color: 'var(--text-2)' }}>{v}</span></div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Difficulty {'●'.repeat(Math.min(5, idea.difficulty || 0))}{'○'.repeat(Math.max(0, 5 - (idea.difficulty || 0)))}</span>
                {idea.source && <a href={idea.source} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--text-3)' }}>source</a>}
                <span style={{ flex: 1 }} />
                <button className="btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => onStartIdea(idea)}>Start this →</button>
              </div>
            </div>
          ))}
          {ideas && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Researched {new Date(ideas.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.</div>}
        </>
      )}
    </div>
  );
}
