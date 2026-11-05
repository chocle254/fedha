import { useState } from 'react';
import { coachAsk, hackForAI, appealTargets, applyAppeal } from '../../lib/hack-coach';

// "Prove them wrong": the builder picks something the judges said, gives proof (repo files, links to the
// live app), and an appeals judge checks it against that proof, fetched fresh on the server.
// A won appeal corrects the verdict, and its fact is told to every future judge (factsText in lib/hack-coach),
// with its files always shown to them (gatherEvidence pinned).
const RULING = {
  upheld: { icon: '✅', text: 'You proved it', color: 'var(--green)' },
  partly: { icon: '🟡', text: 'Partly proved', color: '#F59E0B' },
  rejected: { icon: '❌', text: 'Not proved', color: 'var(--red)' },
};

export default function Appeals({ hack, verdict, saveCoach }) {
  const app = hack.coach?.app;
  const repoFiles = app?.repo?.files || [];
  const targets = appealTargets(verdict);
  const [pick, setPick] = useState('');
  const [argument, setArgument] = useState('');
  const [files, setFiles] = useState([]);
  const [links, setLinks] = useState([]);
  const [fileIn, setFileIn] = useState('');
  const [linkIn, setLinkIn] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const appeals = verdict.appeals || [];
  const target = targets[Number(pick)] || null;

  const addFile = () => {
    const f = fileIn.trim().replace(/^\/+/, '');
    if (!f) return;
    if (repoFiles.length && !repoFiles.includes(f)) { setErr(`${f} is not in the repo's file list. Pick it from the suggestions.`); return; }
    setFiles((x) => [...new Set([...x, f])].slice(0, 4)); setFileIn(''); setErr('');
  };
  const addLink = () => {
    const l = linkIn.trim();
    if (!/^https?:\/\//i.test(l)) { setErr('Links must start with https://'); return; }
    setLinks((x) => [...new Set([...x, l])].slice(0, 3)); setLinkIn(''); setErr('');
  };

  const send = async () => {
    setBusy(true); setErr('');
    try {
      const r = await coachAsk('hack_appeal', { hack: hackForAI(hack), branch: app?.repo?.branch || '', target, argument, files, links });
      const a = { ...r.appeal, at: Date.now() };
      const judged = hack.coach?.judged || [];
      const patch = { judged: [applyAppeal(judged[0], a), ...judged.slice(1)] };
      if (a.ruling !== 'rejected') {
        if (a.fact) patch.appeal_facts = [{ fact: a.fact, at: a.at }, ...(hack.coach?.appeal_facts || [])].slice(0, 12);
        if (a.files?.length) patch.appeal_files = [...new Set([...a.files, ...(hack.coach?.appeal_files || [])])].slice(0, 4);
      }
      await saveCoach(patch);
      setPick(''); setArgument(''); setFiles([]); setLinks([]);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const chip = (label, onX) => (
    <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: 'var(--bg-2)', border: '1px solid var(--border)', fontSize: 12, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {label} <button type="button" onClick={onX} style={{ background: 'none', border: 0, color: 'var(--text-3)', cursor: 'pointer', padding: 0 }} aria-label={`Remove ${label}`}>✕</button>
    </span>
  );

  return (
    <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
      <div className="muse-label" style={{ color: '#7B61FF' }}>⚖️ PROVE THEM WRONG</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.5 }}>
        The judges only see a few files, so they can miss things. Pick what they got wrong and show the proof: files in your repo and links to your live app. An appeals judge reads the proof fresh and rules on it. If you win, the score is corrected and every future judge is told the fact.
      </div>
      {verdict.overall_before_appeals != null && verdict.overall !== verdict.overall_before_appeals && (
        <div style={{ fontSize: 12.5, marginTop: 8, color: 'var(--green)', fontWeight: 600 }}>Score after appeals: {verdict.overall_before_appeals} → {verdict.overall}</div>
      )}

      {targets.length > 0 && (
        <>
          <select className="input" style={{ marginTop: 10 }} value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">What did they get wrong?</option>
            {targets.map((t, i) => <option key={`${t.kind}:${t.target}`} value={i}>{t.label}</option>)}
          </select>
          {target && (
            <>
              <textarea className="input" rows={3} style={{ marginTop: 8 }} value={argument} onChange={(e) => setArgument(e.target.value)}
                placeholder="What's true instead? e.g. The AI runs on every order check: risk.py calls the agent, and /api/health shows ai: ok." />
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input className="input" list="appeal-files" placeholder={repoFiles.length ? 'File that proves it, e.g. backend/app/risk.py' : 'Connect your repo to use files as proof'} value={fileIn} disabled={!repoFiles.length}
                  onChange={(e) => setFileIn(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFile(); } }} style={{ flex: 1, minWidth: 0 }} />
                <button type="button" className="btn-ghost" onClick={addFile} disabled={!fileIn.trim() || files.length >= 4}>+ File</button>
              </div>
              <datalist id="appeal-files">{repoFiles.filter((f) => !files.includes(f)).map((f) => <option key={f} value={f} />)}</datalist>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input className="input" type="url" placeholder={app?.live_url ? `Link, e.g. ${app.live_url.replace(/\/$/, '')}/api/health` : 'Link that proves it (https://…)'} value={linkIn}
                  onChange={(e) => setLinkIn(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }} style={{ flex: 1, minWidth: 0 }} />
                <button type="button" className="btn-ghost" onClick={addLink} disabled={!linkIn.trim() || links.length >= 3}>+ Link</button>
              </div>
              {(files.length > 0 || links.length > 0) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {files.map((f) => chip(`📄 ${f}`, () => setFiles((x) => x.filter((y) => y !== f))))}
                  {links.map((l) => chip(`🔗 ${l}`, () => setLinks((x) => x.filter((y) => y !== l))))}
                </div>
              )}
              <button className="btn-primary" style={{ marginTop: 10 }} onClick={send} disabled={busy || !argument.trim() || (!files.length && !links.length)}>
                {busy ? 'Checking your proof…' : '⚖️ Send to the appeals judge'}
              </button>
            </>
          )}
        </>
      )}
      {err && <div style={{ fontSize: 12.5, color: '#EF4444', marginTop: 8 }}>{err}</div>}

      {appeals.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {appeals.map((a) => {
            const r = RULING[a.ruling] || RULING.rejected;
            return (
              <div key={a.at} style={{ padding: 12, borderRadius: 12, background: 'var(--bg-2)', border: `1px solid ${r.color}` }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: r.color }}>{r.icon} {r.text}{a.new_score ? ` · score now ${a.new_score}/10` : ''}{a.new_status ? ` · now ${a.new_status}` : ''}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>They said: “{String(a.claim || a.target).slice(0, 200)}”</div>
                <div style={{ fontSize: 13, lineHeight: 1.5, marginTop: 4 }}>{a.finding}</div>
                {a.still_do && <div style={{ fontSize: 12, marginTop: 4, color: '#F59E0B' }}>Still worth doing: {a.still_do}</div>}
                {a.failed?.length > 0 && <div style={{ fontSize: 11.5, marginTop: 4, color: 'var(--red)' }}>Couldn&apos;t load: {a.failed.join(' · ')}</div>}
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>Proof: {[...(a.files || []), ...(a.links || [])].join(', ') || 'none loaded'}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
