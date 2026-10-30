import { useState, useEffect } from 'react';
import { todayISO } from '../../lib/utils';
import { PITCH_SLIDES, JUDGE_CRITERIA } from '../../lib/founder-playbook';
import { museAsk, startupForAI, ScoreBar, scoreColor } from './museApi';
import PitchTrainer from '../pitch/PitchTrainer';

const EMPTY = { one_liner: '', elevator: '', slides: {} };

function verdictText(v, name) {
  const L = [`Pitch verdict: ${name} (${v.at})`, `Overall: ${v.overall}/100`, v.verdict];
  if (v.scores?.length) { L.push('', 'SCORES'); v.scores.forEach((x) => L.push(`- ${x.criterion}: ${x.score}/10. ${x.note}`)); }
  if (v.strengths?.length) { L.push('', 'WHAT WORKS'); v.strengths.forEach((x) => L.push(`- ${x}`)); }
  if (v.fixes?.length) { L.push('', 'FIX THESE FIRST'); v.fixes.forEach((x, i) => L.push(`${i + 1}. ${x}`)); }
  if (v.questions?.length) { L.push('', 'THEY WILL ASK'); v.questions.forEach((x) => L.push(`- ${x}`)); }
  return L.join('\n');
}

// Pitch builder (Muse drafts it from your journey), practice mode, and a
// judging panel that scores it like a demo day.
export default function PitchTab({ startup, stages, save, onPractice }) {
  const [p, setP] = useState(startup.pitch || EMPTY);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const [present, setPresent] = useState(-1); // -1 = editing; 0..n = slide in practice mode
  useEffect(() => { if (!dirty) setP(startup.pitch || EMPTY); }, [startup.pitch]); // eslint-disable-line react-hooks/exhaustive-deps

  const judged = startup.pitch?.judged || [];
  const last = judged[0] || null;
  const words = (p.elevator || '').trim().split(/\s+/).filter(Boolean).length;
  const filled = PITCH_SLIDES.filter((s) => (p.slides?.[s.key] || '').trim()).length;
  const gaps = PITCH_SLIDES.filter((s) => /\[ADD:/i.test(p.slides?.[s.key] || '')).length;

  // Spoken practice: the opening + each filled slide is a cue (first ~2 sentences of it).
  const short = (t) => String(t || '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s/).slice(0, 2).join(' ').slice(0, 260);
  const trainerCues = [
    ...(p.one_liner || p.elevator ? [{ title: 'Opening', say: short(p.elevator || p.one_liner), seconds: 20 }] : []),
    ...PITCH_SLIDES.filter((x) => (p.slides?.[x.key] || '').trim()).map((x) => ({ title: x.title, say: short(p.slides[x.key]), seconds: 16 })),
  ];
  const trainerContext = [`Startup: ${startup.name}`, startup.mission ? `Mission: ${startup.mission}` : '', p.one_liner ? `One-liner: ${p.one_liner}` : '', p.elevator ? `Elevator: ${p.elevator}` : '',
    ...PITCH_SLIDES.filter((x) => (p.slides?.[x.key] || '').trim()).map((x) => `${x.title}: ${String(p.slides[x.key]).slice(0, 300)}`)].filter(Boolean).join('\n');

  const set = (patch) => { setP((x) => ({ ...x, ...patch })); setDirty(true); };
  const setSlide = (k, v) => { setP((x) => ({ ...x, slides: { ...(x.slides || {}), [k]: v } })); setDirty(true); };
  function persist(extra = {}) {
    const next = { ...(startup.pitch || {}), ...p, ...extra, updated: todayISO() };
    save({ pitch: next });
    setDirty(false);
    return next;
  }

  async function draft() {
    if ((p.one_liner || filled) && !window.confirm('Replace your current pitch with a fresh draft from Muse?')) return;
    setBusy('draft'); setErr('');
    try {
      const d = await museAsk('pitch_draft', { startup: startupForAI(startup, stages) });
      const next = { ...(startup.pitch || {}), one_liner: d.one_liner, elevator: d.elevator, slides: d.slides, updated: todayISO() };
      setP(next); save({ pitch: next }); setDirty(false);
    } catch (e) { setErr(e.message); }
    setBusy('');
  }

  async function judge() {
    setBusy('judge'); setErr('');
    const cur = persist();
    try {
      const r = await museAsk('pitch_judge', { startup: startupForAI({ ...startup, pitch: cur }, stages), pitch: cur });
      const entry = { ...r, at: todayISO() };
      save({ pitch: { ...cur, judged: [entry, ...(cur.judged || [])].slice(0, 6) } });
      setTimeout(() => document.getElementById('pitch-verdict')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } catch (e) { setErr(e.message); }
    setBusy('');
  }

  // ── Practice mode: one slide at a time ──
  if (present >= 0) {
    const slides = [{ title: startup.name, body: `${p.one_liner}\n\n${p.elevator}` }, ...PITCH_SLIDES.map((s) => ({ title: s.title, body: p.slides?.[s.key] || '' }))];
    const sl = slides[present];
    return (
      <div style={{ padding: '16px 20px 0' }}>
        <div className="muse-present">
          <div className="muse-label" style={{ color: 'rgba(255,255,255,0.6)' }}>{present === 0 ? 'OPENING' : `SLIDE ${present} OF ${slides.length - 1}`}</div>
          <div className="muse-present-title">{sl.title}</div>
          <div className="muse-present-body">{sl.body || 'Nothing on this slide yet.'}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn-ghost" style={{ flex: 1 }} disabled={present === 0} onClick={() => setPresent((i) => i - 1)}>← Back</button>
          {present < slides.length - 1
            ? <button className="btn-primary muse-send" style={{ flex: 2 }} onClick={() => setPresent((i) => i + 1)}>Next →</button>
            : <button className="btn-primary muse-send" style={{ flex: 2 }} onClick={() => setPresent(-1)}>Done ✓</button>}
        </div>
        <button className="muse-link" style={{ display: 'block', margin: '12px auto 0' }} onClick={() => setPresent(-1)}>Exit practice</button>
      </div>
    );
  }

  return (
    <div className="muse-col" style={{ padding: '16px 20px 0' }}>
      <section className="card muse-card">
        <div className="muse-label">🎤 YOUR PITCH</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '8px 0 12px', lineHeight: 1.5 }}>
          A 10-slide pitch in the order investors and judges expect (Sequoia / YC style). Muse drafts it from your journey and notebook. Anything it can't back up is marked <b style={{ color: 'var(--yellow)' }}>[ADD: …]</b> for you to fill.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-primary muse-send" style={{ flex: '1 1 150px' }} onClick={draft} disabled={!!busy}>{busy === 'draft' ? 'Drafting…' : p.one_liner || filled ? '✨ Redraft with Muse' : '✨ Draft my pitch'}</button>
          {(p.one_liner || filled > 0) && <button className="btn-ghost" style={{ flex: '1 1 110px' }} onClick={() => setPresent(0)}>▶ Practice</button>}
        </div>
        {(p.one_liner || filled > 0) && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
            <span className="muse-chip muse-chip-plain">{filled}/{PITCH_SLIDES.length} slides</span>
            <span className="muse-chip muse-chip-plain">⏱ {Math.round(words / 2.5)}s elevator</span>
            {gaps > 0 && <span className="muse-chip" style={{ '--c': '#F59E0B' }}>{gaps} gap{gaps === 1 ? '' : 's'} to fill</span>}
            {last && <span className="muse-chip" style={{ '--c': scoreColor(last.overall) }}>Last score {last.overall}</span>}
          </div>
        )}
        {err && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>{err}</div>}
      </section>

      <section className="card muse-card">
        <label className="muse-label" htmlFor="pitch-oneliner">ONE-LINER</label>
        <input id="pitch-oneliner" className="input" style={{ marginTop: 8 }} placeholder={`${startup.name} helps [who] [do what]`} value={p.one_liner || ''} onChange={(e) => set({ one_liner: e.target.value })} onBlur={() => dirty && persist()} />
        <label className="muse-label" htmlFor="pitch-elevator" style={{ display: 'block', marginTop: 14 }}>30-SECOND ELEVATOR PITCH</label>
        <textarea id="pitch-elevator" className="input" rows={4} style={{ marginTop: 8, lineHeight: 1.5, resize: 'vertical' }} placeholder="Say it out loud: the problem, your solution, proof it works, what you need." value={p.elevator || ''} onChange={(e) => set({ elevator: e.target.value })} onBlur={() => dirty && persist()} />
        <div style={{ fontSize: 11, color: words > 90 ? 'var(--yellow)' : 'var(--text-3)', marginTop: 4 }}>{words} words ≈ {Math.round(words / 2.5)} seconds{words > 90 ? ' — trim it to about 75 words' : ''}</div>
      </section>

      {PITCH_SLIDES.map((s, i) => (
        <section key={s.key} className="card muse-card muse-slide">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="font-num" style={{ fontSize: 12, color: 'var(--text-3)' }}>{String(i + 1).padStart(2, '0')}</span>
            <span style={{ fontWeight: 800, fontSize: 15 }}>{s.title}</span>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '2px 0 8px' }}>{s.hint}</div>
          <textarea className="input" rows={3} style={{ lineHeight: 1.5, resize: 'vertical', borderColor: /\[ADD:/i.test(p.slides?.[s.key] || '') ? 'rgba(245,158,11,0.6)' : undefined }}
            value={p.slides?.[s.key] || ''} onChange={(e) => setSlide(s.key, e.target.value)} onBlur={() => dirty && persist()} placeholder={s.hint} />
        </section>
      ))}

      <PitchTrainer audience="investors" context={trainerContext} cues={trainerCues} opener={short(p.elevator).split(/(?<=[.!?])\s/)[0] || ''} oneLiner={p.one_liner || ''} defaultTarget={180}
        runs={startup.pitch_trainer || []} saveRuns={(runs) => save({ pitch_trainer: runs })} storeKey={`startup_${startup.id}`} />

      <section className="card muse-card muse-agent" style={{ '--stage': '#7B61FF' }}>
        <div className="muse-label">⚖️ JUDGING PANEL</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '8px 0 12px', lineHeight: 1.5 }}>A strict demo-day panel scores what's written on {JUDGE_CRITERIA.length} criteria, tells you the 3 fixes that matter most, and the questions they'd grill you with.</div>
        <button className="btn-primary muse-send" onClick={judge} disabled={!!busy || (!p.one_liner && !filled)}>{busy === 'judge' ? 'Judges are scoring…' : '⚖️ Judge my pitch'}</button>
      </section>

      {last && (
        <section id="pitch-verdict" className="card muse-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="muse-score" style={{ '--c': scoreColor(last.overall) }}>{last.overall}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div className="muse-label">VERDICT · {last.at}</div>
                <button className="muse-link" style={{ marginTop: 0 }} onClick={async () => { try { await navigator.clipboard.writeText(verdictText(last, startup.name)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} }}>{copied ? 'Copied ✓' : '📋 Copy verdict'}</button>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4, marginTop: 4 }}>{last.verdict}</div>
              {judged[1] && <div style={{ fontSize: 11.5, color: last.overall >= judged[1].overall ? 'var(--green)' : 'var(--red)', marginTop: 4 }}>{last.overall >= judged[1].overall ? '▲' : '▼'} from {judged[1].overall} last time</div>}
            </div>
          </div>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {last.scores.map((s) => (
              <div key={s.criterion}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><b>{s.criterion}</b><span className="font-num">{s.score}/10</span></div>
                <ScoreBar value={s.score} color={scoreColor(s.score * 10)} />
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3 }}>{s.note}</div>
              </div>
            ))}
          </div>
          {last.strengths?.length > 0 && <><div className="muse-label" style={{ marginTop: 16, color: 'var(--green)' }}>WHAT WORKS</div><ul className="muse-how">{last.strengths.map((x) => <li key={x}>{x}</li>)}</ul></>}
          {last.fixes?.length > 0 && <><div className="muse-label" style={{ marginTop: 12, color: 'var(--yellow)' }}>FIX THESE FIRST</div><ol className="muse-how">{last.fixes.map((x) => <li key={x}>{x}</li>)}</ol></>}
          {last.questions?.length > 0 && (
            <>
              <div className="muse-label" style={{ marginTop: 12 }}>THEY WILL ASK YOU</div>
              <ul className="muse-how">{last.questions.map((x) => <li key={x}>{x}</li>)}</ul>
              <button className="muse-link" onClick={onPractice}>Practise answering in the Investor Room →</button>
            </>
          )}
        </section>
      )}
    </div>
  );
}
