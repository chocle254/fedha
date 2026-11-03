import { useEffect, useMemo, useRef, useState } from 'react';
import ProfessorByte from './ProfessorByte';
import { askStudy } from '../../lib/study';
import { speakByte } from '../../lib/byte-voice';
import { stopSpeaking } from '../../lib/voice';
import { labOf, missedLessons, newLab, sharpness, unitsOf, FILE_CAP, MAX_FILES } from '../../lib/labs';
import { runProject } from '../../lib/code-runner';
import { getKb } from '../../lib/byte-kb';
import { getMaterials, relevantMaterial } from '../../lib/materials';
import { folderOf } from '../../lib/course-folders';

// The Project Lab: after a unit, Byte (in his lab coat) runs a hands-on project built from it. Skipped a lesson?
// You explain yourself first. Then: the mission, a milestone checklist, a code workspace (several files, Run with
// real output on the phone), and Byte's review of each milestone (done or exactly what to fix, a score out of 10,
// and whether you're getting sharper). Saved as a learning project, so it carries on where you stopped.
export default function LabMode({ course, section, projects, onSave, onMilestoneXP, onShip, onClose, onStudyLesson }) {
  const units = useMemo(() => unitsOf(course), [course]);
  const unit = units.find((u) => u.section === section) || units[0];
  const [lab, setLab] = useState(() => labOf(projects, course.id, unit?.section));
  const [phase, setPhase] = useState('start'); // start | explain | designing | bench
  const [line, setLine] = useState('');
  const [talking, setTalking] = useState(false);
  const [level, setLevel] = useState(0);
  const [mood, setMood] = useState('happy');
  const [file, setFile] = useState(0);
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [review, setReview] = useState(null);
  const [showHint, setShowHint] = useState(false);
  // explain-yourself gate
  const [missed, setMissed] = useState([]);
  const [qs, setQs] = useState(null);
  const [answers, setAnswers] = useState({});
  const [verdict, setVerdict] = useState(null);
  const explainedRef = useRef([]);
  const speaker = useRef(null);
  const saveT = useRef(null);

  const say = (text, m = 'happy') => {
    setLine(text); setMood(m);
    speaker.current?.stop();
    setTalking(true);
    speaker.current = speakByte(text, { mood: m, onLevel: setLevel, onEnd: () => { setTalking(false); setLevel(0); } });
  };
  useEffect(() => () => { speaker.current?.stop(); stopSpeaking(); clearTimeout(saveT.current); }, []);

  const L = lab?.lab;
  const ms = L?.milestones || [];
  const cur = ms.findIndex((m) => !m.done);
  const allDone = ms.length > 0 && cur === -1;
  const sharp = useMemo(() => sharpness(projects, course.id), [projects, course.id]);

  // Opening: the explain-yourself gate first, then the lab (designed now if it doesn't exist yet).
  useEffect(() => {
    if (phase !== 'start' || !unit) return;
    const miss = missedLessons(course, unit.section, lab?.lab?.explained || []).slice(0, 2);
    if (miss.length) { setMissed(miss); setPhase('explain'); askMissed(miss); return; }
    openBench();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function askMissed(miss) {
    say(`Hold on. Before you touch my lab: you skipped ${miss.map((l) => `"${l.title}"`).join(' and ')}. You have some explaining to do.`, 'impatient');
    setBusy('Byte is preparing his questions…');
    try {
      const all = [];
      for (const l of miss) {
        const kb = await getKb(course.id, l.id);
        const j = await askStudy({ type: 'missed_check', lesson: l.title, course: course.title, context: [kb?.summary, ...(kb?.concepts || []).map((c) => `${c.name}: ${c.idea}`), l.aiNotes].filter(Boolean).join('\n').slice(0, 4000) });
        all.push(...j.questions.map((q) => ({ ...q, lesson: l })));
      }
      setQs(all);
    } catch (e) { setErr(e.message); } finally { setBusy(''); }
  }
  async function markAnswers() {
    setBusy('Marking…');
    let score = 0;
    const per = [];
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i];
      let g = null;
      try { g = await askStudy({ type: 'quiz_grade', ask: q.ask, answer: q.answer, reply: answers[i] || "I don't know" }); } catch { g = { verdict: 'partial', say: '' }; }
      score += g.verdict === 'right' ? 1 : g.verdict === 'partial' ? 0.5 : 0;
      per.push({ ...g, q });
    }
    setBusy('');
    const pass = score >= qs.length * 0.6;
    setVerdict({ pass, per });
    if (pass) {
      explainedRef.current = missed.map((l) => l.id);
      say(`Fine. You know enough to be dangerous. Do not skip my lessons again. Into the lab.`, 'cheeky');
    } else {
      say(`No. That was not an explanation, that was a guess. Go do the lesson, then come back to my lab.`, 'facepalm');
    }
  }

  async function openBench() {
    if (lab) {
      setPhase('bench');
      const n = (lab.lab.milestones || []).filter((m) => m.done).length;
      const next = lab.lab.milestones.find((m) => !m.done);
      say(next ? (n ? `Welcome back to the lab. ${n} milestone${n === 1 ? '' : 's'} done. Next up: ${next.title}.` : `Lab is open. Mission: ${lab.title}. First milestone: ${next.title}.`) : `This lab is finished. Ship it, or open the next unit.`, 'excited');
      return;
    }
    setPhase('designing');
    say(`Unit ${unit.index + 1} done. Lab time. Give me a moment, I am setting up the bench.`, 'excited');
    try {
      const notes = [];
      for (const l of unit.lessons) { const kb = await getKb(course.id, l.id); if (kb?.summary) notes.push(`${l.title}: ${kb.summary}`); }
      const mats = relevantMaterial(await getMaterials(course.id), `${unit.section} ${unit.lessons.map((l) => l.title).join(' ')}`, 3000);
      const prev = (projects || []).filter((p) => p.lab && p.lab.course_id === course.id).map((p) => p.title);
      const j = await askStudy({ type: 'lab_project', course: course.title, unit: unit.index + 1, section: unit.section, lessons: unit.lessons.map((l) => l.title), domain: folderOf(course), previous: prev, context: [notes.join('\n'), mats].filter(Boolean).join('\n\n') });
      const p = newLab(course, unit, j);
      p.lab.explained = explainedRef.current;
      setLab(p); await onSave(p);
      setPhase('bench');
      say(`Here is the mission: ${j.brief} Start with milestone one: ${j.milestones[0].title}.`, 'excited');
    } catch (e) { setErr(e.message); setPhase('start'); }
  }

  // Keep the code saved as you type (every 2 s).
  const update = (next) => {
    setLab(next);
    clearTimeout(saveT.current);
    saveT.current = setTimeout(() => onSave(next), 2000);
  };
  const setCode = (content) => update({ ...lab, lab: { ...L, files: L.files.map((f, i) => (i === file ? { ...f, content: content.slice(0, FILE_CAP) } : f)) } });
  const addFile = () => {
    const name = window.prompt('File name (e.g. utils.py):', L.lang === 'javascript' ? 'utils.js' : 'utils.py');
    if (!name || L.files.length >= MAX_FILES) return;
    update({ ...lab, lab: { ...L, files: [...L.files, { name: name.trim().slice(0, 60), content: '' }] } });
    setFile(L.files.length);
  };
  const onKey = (e) => {
    const el = e.target, a = el.selectionStart, z = el.selectionEnd, code = L.files[file].content;
    if (e.key === 'Tab') { e.preventDefault(); setCode(code.slice(0, a) + '    ' + code.slice(z)); requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = a + 4; }); }
    if (e.key === 'Enter') {
      const ln = code.slice(0, a).split('\n').pop();
      const ind = (ln.match(/^\s*/) || [''])[0] + (/[:{([]\s*$/.test(ln) ? '    ' : '');
      e.preventDefault(); setCode(`${code.slice(0, a)}\n${ind}${code.slice(z)}`);
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = a + 1 + ind.length; });
    }
  };

  const run = async () => {
    setBusy(/^py/.test(L.lang) ? 'Running (the first Python run downloads Python, ~10 s)…' : 'Running…'); setErr('');
    const r = await runProject({ lang: L.lang, files: L.files });
    setBusy(''); setOut(r);
    if (r.error) say(pick(['It crashed. Read the error, it is literally telling you what is wrong.', 'Boom. Error. Look at the last line of the traceback first.', 'Red text. My favourite. Read it, fix it, run it again.']), 'facepalm');
    return r;
  };
  const submit = async () => {
    const m = ms[cur];
    if (!m) return;
    setBusy('Byte is reviewing your code…'); setErr(''); setReview(null);
    let r = out;
    if (!r) r = await run();
    try {
      const j = await askStudy({ type: 'lab_review', title: lab.title, brief: L.brief, n: cur + 1, milestone: m, files: L.files, run: r ? `${r.out || ''}${r.error ? `\nERROR: ${r.error}` : ''}` : '', history: (L.reviews || []).map((x) => x.score) });
      const rv = j.review;
      setReview(rv);
      const reviews = [...(L.reviews || []), { at: new Date().toISOString(), milestone: m.id, score: rv.score }].slice(-40);
      const milestones = ms.map((x, i) => (i === cur ? { ...x, done: rv.done || x.done, score: rv.score, review: { say: rv.say, fixes: rv.fixes, at: new Date().toISOString() } } : x));
      const next = { ...lab, milestones: lab.milestones.map((x) => (x.id === m.id ? { ...x, done: rv.done || x.done } : x)), lab: { ...L, milestones, reviews } };
      setLab(next); await onSave(next);
      if (rv.done) onMilestoneXP?.(next, m.id);
      const finished = milestones.every((x) => x.done);
      say(finished ? `${rv.say} And that is the whole lab done. Ship it.` : rv.say, rv.done ? 'proud' : rv.score >= 5 ? 'thinking' : 'serious');
    } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };
  const ship = async () => {
    const link = window.prompt('Link to show it (GitHub, demo…), optional:', lab.link || '');
    if (link === null) return;
    await onShip({ ...lab, link: link.trim() });
    const nextUnit = units[unit.index + 1];
    say(nextUnit ? `Shipped. Now back to class: unit ${nextUnit.index + 1}, ${nextUnit.section}. Then another lab. No rest for builders.` : 'Shipped. That was the last unit. Capstone time: check the Capstone section.', 'proud');
  };

  const f = L?.files?.[file];
  const lines = (f?.content || '').split('\n').length;
  const nextUnit = units[unit?.index + 1];
  return (
    <div className="lab">
      <div className="lab-wrap">
        <div className="lab-head">
          <span className="lab-led" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="lab-kicker">PROJECT LAB · UNIT {unit ? unit.index + 1 : ''} · {course.title.toUpperCase()}</div>
            <div className="lab-title">{lab?.title || unit?.section}</div>
          </div>
          <button className="btn-ghost" onClick={() => { if (lab) onSave(lab); onClose(); }}>Leave lab</button>
        </div>

        <div className="lab-byte">
          <ProfessorByte outfit="lab" size={92} mood={mood} talking={talking} level={level} gesture={talking ? 'explain' : 'none'} thinking={!!busy && !talking} />
          <div className="lab-say">{line || '…'}{busy && <div className="lab-busy">{busy}</div>}</div>
        </div>
        {err && <div style={{ color: 'var(--red)', fontSize: 12.5, margin: '6px 0' }}>{err}</div>}

        {phase === 'explain' && (
          <div className="lab-card">
            <div className="lab-kicker" style={{ color: '#F87171' }}>EXPLAIN YOURSELF</div>
            <div style={{ fontSize: 12.5, color: '#9CA3AF', margin: '4px 0 8px' }}>You skipped: {missed.map((l) => l.title).join(', ')}</div>
            {qs?.map((q, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{i + 1}. {q.ask}</div>
                <textarea className="lab-input" rows={2} value={answers[i] || ''} onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })} placeholder="Explain…" disabled={!!verdict} />
                {verdict?.per[i] && <div style={{ fontSize: 12, marginTop: 4, color: verdict.per[i].verdict === 'right' ? '#34D399' : verdict.per[i].verdict === 'partial' ? '#FBBF24' : '#F87171' }}>{verdict.per[i].say}</div>}
              </div>
            ))}
            {qs && !verdict && <button className="lab-btn" disabled={!!busy} onClick={markAnswers}>Submit my explanation</button>}
            {verdict?.pass && <button className="lab-btn" onClick={openBench}>Enter the lab →</button>}
            {verdict && !verdict.pass && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{missed.map((l) => <button key={l.id} className="lab-btn" onClick={() => onStudyLesson(l.id)}>Study “{l.title}” now</button>)}</div>}
          </div>
        )}

        {phase === 'bench' && L && (
          <>
            <div className="lab-card">
              <div className="lab-kicker">MISSION</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.55, marginTop: 4 }}>{L.brief}</div>
              {L.why && <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>Proves: {L.why}</div>}
            </div>

            <div className="lab-card">
              <div style={{ display: 'flex', alignItems: 'baseline' }}><div className="lab-kicker" style={{ flex: 1 }}>MILESTONES · {ms.filter((m) => m.done).length}/{ms.length}</div>
                {sharp.now != null && <span style={{ fontSize: 11.5, color: sharp.before == null ? '#9CA3AF' : sharp.now > sharp.before + 0.3 ? '#34D399' : sharp.now < sharp.before - 0.3 ? '#F87171' : '#FBBF24' }}>sharpness {sharp.now.toFixed(1)}/10{sharp.before != null ? (sharp.now > sharp.before + 0.3 ? ' ↑ getting sharper' : sharp.now < sharp.before - 0.3 ? ' ↓ slipping' : ' → steady') : ''}</span>}
              </div>
              <div className="lab-bar"><i style={{ width: `${ms.length ? (ms.filter((m) => m.done).length / ms.length) * 100 : 0}%` }} /></div>
              {ms.map((m, i) => (
                <div key={m.id} className={`lab-ms ${m.done ? 'done' : i === cur ? 'now' : ''}`}>
                  <span>{m.done ? '✓' : i === cur ? '▶' : '○'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{m.title}{m.score != null ? <span style={{ fontWeight: 500, color: '#9CA3AF' }}> · {m.score}/10</span> : null}</div>
                    {i === cur && <><div style={{ fontSize: 12, color: '#D1D5DB', marginTop: 2 }}>{m.goal}</div><ul style={{ fontSize: 11.5, color: '#9CA3AF', margin: '4px 0 0', paddingLeft: 16 }}>{m.criteria.map((c, k) => <li key={k}>{c}</li>)}</ul>
                      <button className="lab-link" onClick={() => setShowHint(!showHint)}>{showHint ? 'Hide hint' : '💡 Hint'}</button>{showHint && <div style={{ fontSize: 12, color: '#FDE68A' }}>{m.hint}</div>}</>}
                  </div>
                </div>
              ))}
              {sharp.points.length > 1 && (
                <svg viewBox="0 0 200 36" style={{ width: '100%', height: 36, marginTop: 6 }} aria-label="Review scores over time">
                  <polyline fill="none" stroke="#34D399" strokeWidth="1.6" points={sharp.points.map((p, i) => `${(i / (sharp.points.length - 1)) * 196 + 2},${34 - (p.score / 10) * 30}`).join(' ')} />
                </svg>
              )}
            </div>

            <div className="lab-card lab-ws">
              <div className="lab-tabs">
                {L.files.map((x, i) => <button key={x.name + i} className={i === file ? 'on' : ''} onClick={() => setFile(i)}>{x.name}</button>)}
                {L.files.length < MAX_FILES && <button onClick={addFile} aria-label="New file">＋</button>}
              </div>
              {f && (
                <div className="lab-editor">
                  <div className="lab-gutter" aria-hidden="true">{Array.from({ length: Math.max(lines, 12) }, (_, i) => <div key={i} style={{ color: review?.fixes?.some((x) => x.file === f.name && x.line === i + 1) ? '#FBBF24' : undefined }}>{i + 1}</div>)}</div>
                  <textarea value={f.content} onChange={(e) => setCode(e.target.value)} onKeyDown={onKey} spellCheck={false} autoCapitalize="off" autoCorrect="off" style={{ minHeight: Math.max(12, lines) * 19 + 16 }} />
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <button className="lab-btn ghost" disabled={!!busy} onClick={run}>▶ Run</button>
                {!allDone && <button className="lab-btn" disabled={!!busy} onClick={submit}>Submit milestone {cur + 1} to Byte</button>}
                {allDone && lab.status !== 'shipped' && <button className="lab-btn" onClick={ship}>🚀 Ship the lab</button>}
                {allDone && nextUnit && <button className="lab-btn ghost" onClick={() => onStudyLesson(nextUnit.lessons.find((l) => !l.completed)?.id || nextUnit.lessons[0].id)}>Next: unit {nextUnit.index + 1} →</button>}
              </div>
              {out && <pre className="lab-term">{`$ run ${out.entry || ''}\n`}{out.out || ''}{out.error ? `\n${out.error}` : ''}{!out.out && !out.error ? '(no output)' : ''}</pre>}
            </div>

            {review && (
              <div className="lab-card">
                <div className="lab-kicker" style={{ color: review.done ? '#34D399' : '#FBBF24' }}>BYTE'S REVIEW · {review.score}/10 · {review.done ? 'MILESTONE PASSED' : 'NOT YET'}</div>
                {review.good?.length > 0 && <div style={{ fontSize: 12.5, marginTop: 6 }}>{review.good.map((g, i) => <div key={i}>✓ {g}</div>)}</div>}
                {review.fixes?.map((x, i) => <div key={i} style={{ fontSize: 12.5, marginTop: 4 }}><b style={{ color: '#FBBF24' }}>{x.file}{x.line ? `:${x.line}` : ''}</b> {x.note}</div>)}
                {review.growth && <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 6 }}>📈 {review.growth}</div>}
                {review.next && <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>Next: {review.next}</div>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
const pick = (a) => a[Math.floor(Math.random() * a.length)];
