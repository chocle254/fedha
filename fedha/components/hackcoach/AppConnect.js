import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { genId, todayISO } from '../../lib/utils';
import { getSetting, setSetting } from '../../lib/db';
import { fetchRepos, sortRepos } from '../../lib/github';
import { scanRepo, parseRepo, linkedFacts, hackForAI, coachAsk, startDateOf, timelineOf, timelineText, gatherEvidence, applyFacts } from '../../lib/hack-coach';

// Connect an app you already built (GitHub repo, a Luxe startup or
// Showroom project, or just a live link) so the coach knows what exists,
// checks it against the hackathon, and counts your commits as progress.

const FIT = { strong: ['Strong fit', '#10B981'], partial: ['Partial fit', '#F59E0B'], weak: ['Weak fit', '#EF4444'] };
const MATURITY = { idea: 'Idea', prototype: 'Prototype', working_mvp: 'Working MVP', production: 'In production' };
const ago = (iso) => {
  if (!iso) return '';
  const h = (Date.now() - new Date(iso).getTime()) / 3600000;
  return h < 1 ? 'just now' : h < 48 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`;
};

export default function AppConnect({ hack, cur, save, saveCoach, busy, run, onUseIdea, compact = false }) {
  const { startups = [], projects = [] } = useApp();
  const app = hack.coach?.app || null;
  const a = app?.analysis || null;
  const [source, setSource] = useState('github');
  const [user, setUser] = useState('');
  const [repos, setRepos] = useState([]);
  const [repoInput, setRepoInput] = useState(hack.repo_url || '');
  const [linkedKey, setLinkedKey] = useState('');
  const [live, setLive] = useState('');
  const [folder, setFolder] = useState('');
  const [loadErr, setLoadErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState({});
  const [open, setOpen] = useState(false);

  useEffect(() => { getSetting('github_username', '').then((v) => v && setUser(v)).catch(() => {}); }, []);

  async function loadRepos() {
    setLoading(true); setLoadErr('');
    try { setRepos(sortRepos(await fetchRepos(user), 'updated')); await setSetting('github_username', user.trim()); }
    catch (e) { setLoadErr(e.message); setRepos([]); }
    setLoading(false);
  }

  function chosenLinked() {
    if (!linkedKey) return null;
    const [kind, id] = linkedKey.split(':');
    const item = (kind === 'startup' ? startups : projects).find((x) => x.id === id);
    return item ? { item, facts: linkedFacts(kind, item) } : null;
  }

  async function analyse(input) {
    const base = cur();
    const appObj = { ...input, timeline: timelineOf(base, input.repo) };
    const withApp = { ...base, coach: { ...(base.coach || {}), app: appObj } };
    const sources = await gatherEvidence(input.repo, { maxFiles: 6, perFile: 1500 });
    const raw = await coachAsk('hack_app', { hack: hackForAI(withApp, { full: true, evidence: sources }) });
    // Rules that code can check (build dates, files, license, live URL) are re-marked from the facts.
    const analysis = { ...raw, requirements: applyFacts(raw.requirements, withApp) };
    saveCoach({ app: { ...appObj, analysis, analysed_at: Date.now() } });
  }

  function connect() {
    run('app', async () => {
      const link = chosenLinked();
      const repoName = parseRepo(repoInput) || parseRepo(link?.item?.repo_url);
      const liveUrl = live.trim() || link?.item?.site_url || link?.item?.stages?.prototyping?.prototype_link || '';
      if (!repoName && !link && !liveUrl) throw new Error('Pick a repo, a Luxe startup or project, or paste a live link.');
      const repo = repoName ? await scanRepo(repoName, { folder }) : null;
      const appObj = {
        name: link?.item?.name || repo?.full_name?.split('/')[1] || hack.project_name || 'My app',
        repo, live_url: liveUrl, linked: link?.facts || null, connected_at: Date.now(),
      };
      const extra = {};
      if (!cur().repo_url && repo?.url) extra.repo_url = repo.url;
      if (!cur().project_name) extra.project_name = appObj.name;
      saveCoach({ app: appObj }, extra);
      await analyse(appObj);
    });
  }

  // Re-read the repo: new commits become progress-log entries.
  function rescan(nextFolder) {
    run('app', async () => {
      let next = { ...app };
      if (app.repo?.full_name) {
        const f = typeof nextFolder === 'string' ? nextFolder : app.repo.folder || '';
        const fresh = await scanRepo(app.repo.full_name, { folder: f });
        const known = new Set((app.repo.commits || []).map((c) => c.sha));
        const added = fresh.commits.filter((c) => !known.has(c.sha));
        next = { ...next, repo: fresh };
        if (added.length) {
          const entries = added.map((c) => ({ id: genId(), date: String(c.date || '').slice(0, 10) || todayISO(), at: new Date(c.date).getTime() || Date.now(), text: `🔨 Commit: ${c.message}`, minutes: 0 }));
          const log = [...entries, ...(cur().coach?.log || [])].sort((x, y) => (y.at || 0) - (x.at || 0)).slice(0, 200);
          saveCoach({ app: next, log });
        } else saveCoach({ app: next });
      }
      await analyse(next);
    });
  }

  function useAsIdea() {
    const twists = (a.upgrades || []).filter((_, i) => picked[i]).map((u) => u.title);
    onUseIdea({ ...a.idea, twists, from_app: true, why_wins: a.fit_note, fit: a.fit === 'weak' ? 'tight' : 'fits' });
  }

  // ── Not connected yet ──
  if (!app) {
    if (compact) return null;
    return (
      <section className="card muse-card">
        <div className="muse-label">🔗 ALREADY BUILT SOMETHING FOR THIS?</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '8px 0 10px', lineHeight: 1.5 }}>Connect your app. The mentor reads the repo (README, files, dependencies, commits), checks it against this hackathon's rules and criteria, and counts your commits as progress.</div>
        <div className="muse-suggest" style={{ marginTop: 0 }}>
          {[['github', '🐙 GitHub repo'], ['fedha', '💡 From Luxe'], ['link', '🌐 Just a link']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setSource(k)} style={source === k ? { borderColor: '#7B61FF', background: 'rgba(123,97,255,0.15)' } : undefined}>{l}</button>
          ))}
        </div>

        {source === 'github' && (
          <div style={{ marginTop: 12 }}>
            <label className="muse-label" htmlFor="ac-repo">REPO URL OR OWNER/NAME</label>
            <input id="ac-repo" className="input" style={{ marginTop: 6 }} placeholder="https://github.com/you/your-app" value={repoInput} onChange={(e) => setRepoInput(e.target.value)} />
            <label className="muse-label" htmlFor="ac-folder" style={{ display: 'block', marginTop: 10 }}>PROJECT FOLDER (IF IT'S INSIDE A BIGGER REPO)</label>
            <input id="ac-folder" className="input" style={{ marginTop: 6 }} placeholder="e.g. hackathons/my-project · leave empty for the whole repo" value={folder} onChange={(e) => setFolder(e.target.value.trim())} />
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '10px 0 6px' }}>Or pick from your repos:</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" style={{ flex: 1 }} placeholder="GitHub username" value={user} onChange={(e) => setUser(e.target.value)} aria-label="GitHub username" />
              <button className="btn-ghost" style={{ width: 'auto', padding: '0 14px' }} onClick={loadRepos} disabled={loading || !user.trim()}>{loading ? '…' : 'Load'}</button>
            </div>
            {loadErr && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{loadErr}</div>}
            {repos.length > 0 && (
              <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {repos.map((r) => (
                  <button key={r.id} type="button" onClick={() => setRepoInput(r.html_url)}
                    style={{ textAlign: 'left', background: parseRepo(repoInput) === r.full_name ? 'rgba(123,97,255,0.15)' : 'var(--bg-2)', border: `1px solid ${parseRepo(repoInput) === r.full_name ? '#7B61FF' : 'var(--border)'}`, borderRadius: 10, padding: '8px 10px', cursor: 'pointer', color: 'var(--text)', fontFamily: 'inherit' }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{r.language ? `● ${r.language} · ` : ''}updated {ago(r.pushed_at || r.updated_at)}{r.description ? ` · ${r.description.slice(0, 60)}` : ''}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {source === 'fedha' && (
          <div style={{ marginTop: 12 }}>
            <label className="muse-label" htmlFor="ac-linked">STARTUP OR SHOWROOM PROJECT</label>
            <select id="ac-linked" className="input" style={{ marginTop: 6 }} value={linkedKey} onChange={(e) => {
              setLinkedKey(e.target.value);
              const [kind, id] = e.target.value.split(':');
              const item = (kind === 'startup' ? startups : projects).find((x) => x.id === id);
              if (item?.repo_url) setRepoInput(item.repo_url);
            }}>
              <option value="">Choose…</option>
              {startups.length > 0 && <optgroup label="Startups">{startups.map((s) => <option key={s.id} value={`startup:${s.id}`}>💡 {s.name}</option>)}</optgroup>}
              {projects.length > 0 && <optgroup label="Showroom">{projects.map((p) => <option key={p.id} value={`project:${p.id}`}>🗂 {p.name}</option>)}</optgroup>}
            </select>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>The mentor reads what you wrote there (problem, solution, stack, features). Add its repo too so it can read the code:</div>
            <input className="input" style={{ marginTop: 6 }} placeholder="Repo URL (optional)" value={repoInput} onChange={(e) => setRepoInput(e.target.value)} aria-label="Repo URL" />
          </div>
        )}

        <label className="muse-label" htmlFor="ac-live" style={{ display: 'block', marginTop: 12 }}>LIVE LINK {source === 'link' ? '' : '(OPTIONAL)'}</label>
        <input id="ac-live" className="input" style={{ marginTop: 6 }} placeholder="https://your-app.vercel.app" value={live} onChange={(e) => setLive(e.target.value)} />
        <button className="btn-primary muse-send" style={{ marginTop: 12 }} onClick={connect} disabled={!!busy || !hack.coach?.brief}>{busy === 'app' ? 'Reading your app…' : !hack.coach?.brief ? 'Paste the brief first' : '🔗 Connect and check it'}</button>
      </section>
    );
  }

  // ── Connected ──
  const r = app.repo;
  const start = startDateOf(hack);
  const tl = timelineOf(hack, r);
  const tlColor = { during: 'var(--green)', before: 'var(--yellow)' }[tl.verdict] || 'var(--text-2)';
  const stale = !!a && (app.timeline?.start || '') !== start;
  const [fitLabel, fitColor] = FIT[a?.fit] || FIT.partial;
  return (
    <section className="card muse-card" style={{ borderColor: 'rgba(123,97,255,0.35)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div className="muse-label">🔗 YOUR APP</div>
        <div style={{ display: 'flex', gap: 14 }}>
          <button className="muse-link" style={{ marginTop: 0 }} onClick={() => rescan()} disabled={!!busy}>{busy === 'app' ? 'Reading…' : '↻ Rescan'}</button>
          {!compact && <button className="muse-link" style={{ marginTop: 0, color: 'var(--text-3)' }} onClick={() => { if (window.confirm('Disconnect this app from the coach? Your idea and plan stay.')) saveCoach({ app: null }); }}>Disconnect</button>}
        </div>
      </div>
      <div style={{ fontSize: 15.5, fontWeight: 800, marginTop: 6 }}>{app.name}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
        {a && <span className="muse-chip" style={{ '--c': fitColor }}>{fitLabel}</span>}
        {a?.maturity && <span className="muse-chip muse-chip-plain">{MATURITY[a.maturity]}</span>}
        {r && <span className="muse-chip muse-chip-plain">🐙 {r.folder ? `${r.folder}/ · ` : ''}{r.file_count} files · pushed {ago(r.pushed_at)}</span>}
        {(r?.languages || []).slice(0, 3).map((l) => <span key={l} className="muse-chip muse-chip-plain">{l}</span>)}
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8, fontSize: 12 }}>
        {r?.url && <a href={r.url} target="_blank" rel="noreferrer" style={{ color: '#A78BFA' }}>Repo ↗</a>}
        {app.live_url && <a href={app.live_url} target="_blank" rel="noreferrer" style={{ color: '#A78BFA' }}>Live ↗</a>}
        {app.linked && <span style={{ color: 'var(--text-3)' }}>Linked to your Luxe {app.linked.kind}</span>}
      </div>

      {r && r.dirs?.length > 0 && !compact && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
          <label htmlFor="ac-dir" style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>Project folder</label>
          <select id="ac-dir" className="input" style={{ flex: 1, padding: '6px 10px', fontSize: 12.5 }} value={r.folder || ''} disabled={!!busy} onChange={(e) => rescan(e.target.value)}>
            <option value="">Whole repo</option>
            {r.dirs.map((d) => <option key={d} value={d}>{d}/</option>)}
          </select>
        </div>
      )}
      {r && (
        <div className="muse-bubble" style={{ marginTop: 10, fontSize: 12.5, borderLeft: `3px solid ${tlColor}` }}>
          <div className="muse-bubble-kicker" style={{ color: tlColor }}>{tl.verdict === 'during' ? '✅ BUILT DURING THE HACKATHON' : tl.verdict === 'before' ? '⚠ STARTED BEFORE THE HACKATHON' : '📅 BUILD DATES'}</div>
          <div>{timelineText(tl)}</div>
          {r.first_commit && <div style={{ color: 'var(--text-3)', marginTop: 4 }}>First commit: “{r.first_commit.message}” · {tl.commit_count} commits</div>}
          {!start && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <label htmlFor="ac-start" style={{ fontSize: 12, fontWeight: 700 }}>Hackathon opened</label>
              <input id="ac-start" type="date" className="input" style={{ flex: 1 }} onChange={(e) => e.target.value && saveCoach({ start_date: e.target.value })} />
            </div>
          )}
          {stale && <button className="muse-link" onClick={() => rescan()} disabled={!!busy}>The start date changed since the last check. Rescan to update it →</button>}
        </div>
      )}
      {!a && <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 10 }}>Not checked against the hackathon yet. Tap Rescan.</div>}
      {a && (
        <>
          <div style={{ fontSize: 13, lineHeight: 1.55, marginTop: 10 }}>{a.what_it_does}</div>
          {a.fit_note && <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 6, lineHeight: 1.5 }}><b style={{ color: fitColor }}>Fit:</b> {a.fit_note}{a.track ? ` Best track: ${a.track}.` : ''}</div>}
          {a.new_code_risk && tl.verdict !== 'during' && <div className="muse-bubble muse-tone-warn" style={{ marginTop: 10, fontSize: 12.5 }}>⚠ {a.new_code_risk}</div>}
          {compact ? (
            r?.commits?.length > 0 && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>Last commit {ago(r.commits[0].date)}: “{r.commits[0].message}”</div>
          ) : (
            <>
              <button className="muse-link" onClick={() => setOpen((v) => !v)}>{open ? 'Hide details' : `What's built, requirements and gaps`}</button>
              {open && (
                <>
                  {a.features?.length > 0 && <><div className="muse-label" style={{ marginTop: 10, color: 'var(--green)' }}>ALREADY BUILT</div><ul className="muse-how">{a.features.map((x) => <li key={x}>{x}</li>)}</ul></>}
                  {a.requirements?.length > 0 && <><div className="muse-label" style={{ marginTop: 8 }}>RULES CHECK</div><ul className="muse-how" style={{ listStyle: 'none', paddingLeft: 0 }}>{a.requirements.map((q) => <li key={q.rule}>{q.status === 'met' ? '✅' : q.status === 'missing' ? '❌' : '❔'} {q.rule}{q.note ? <span style={{ color: 'var(--text-3)' }}> · {q.note}</span> : null}</li>)}</ul></>}
                  {a.gaps?.length > 0 && <><div className="muse-label" style={{ marginTop: 8, color: 'var(--yellow)' }}>WHAT THIS HACKATHON WANTS THAT IT LACKS</div><ul className="muse-how">{a.gaps.map((x) => <li key={x}>{x}</li>)}</ul></>}
                  {a.demo_path?.length > 0 && <><div className="muse-label" style={{ marginTop: 8 }}>DEMO PATH FOR THE JUDGES</div><ol className="muse-how">{a.demo_path.map((x) => <li key={x}>{x}</li>)}</ol></>}
                  {r?.commits?.length > 0 && <><div className="muse-label" style={{ marginTop: 8 }}>RECENT COMMITS</div><ul className="muse-how" style={{ listStyle: 'none', paddingLeft: 0 }}>{r.commits.slice(0, 5).map((c) => <li key={c.sha}><span className="font-num" style={{ color: 'var(--text-3)' }}>{String(c.date || '').slice(0, 10)}</span> · {c.message}</li>)}</ul></>}
                </>
              )}
              {a.upgrades?.length > 0 && (
                <>
                  <div className="muse-label" style={{ marginTop: 12, color: '#E64FB4' }}>ADD FOR THIS HACKATHON · TICK TO INCLUDE</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                    {a.upgrades.map((u, i) => (
                      <label key={u.title} style={{ display: 'flex', gap: 8, fontSize: 12.5, lineHeight: 1.45, cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!picked[i]} onChange={(e) => setPicked((p) => ({ ...p, [i]: e.target.checked }))} style={{ marginTop: 3 }} />
                        <span><b>{u.title}</b>{u.hours ? ` (~${u.hours}h)` : ''}{u.why ? <span style={{ color: 'var(--text-3)' }}> · {u.why}</span> : null}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
              <button className="btn-primary muse-send" style={{ marginTop: 12 }} onClick={useAsIdea}>{hack.coach?.idea?.from_app ? '↻ Update my project from this app' : '🎯 Enter this app as my project'}</button>
            </>
          )}
        </>
      )}
    </section>
  );
}
