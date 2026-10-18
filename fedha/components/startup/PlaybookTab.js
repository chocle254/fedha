import { useState, useEffect } from 'react';
import { STAGES } from '../../lib/startup';
import { PLAYBOOK, LIBRARY } from '../../lib/founder-playbook';

// The founder playbook for each stage: goal, step-by-step how-to, a readiness
// checklist ("gate") you tick off, common mistakes and the guides behind it.
export default function PlaybookTab({ startup, currentStage, focusStage, save, onSchedule, onAsk }) {
  const [viewId, setViewId] = useState(focusStage || currentStage.id);
  const [openStep, setOpenStep] = useState(0);
  useEffect(() => { if (focusStage) setViewId(focusStage); }, [focusStage]);

  const st = STAGES.find((s) => s.id === viewId) || currentStage;
  const p = PLAYBOOK[st.id];
  const gates = startup.gates?.[st.id] || [];
  const ready = p ? p.gate.filter((_, i) => gates[i]).length : 0;

  function toggleGate(i) {
    const next = [...(startup.gates?.[st.id] || p.gate.map(() => false))];
    next[i] = !next[i];
    save({ gates: { ...(startup.gates || {}), [st.id]: next } });
  }

  const topics = [...new Set(LIBRARY.map((l) => l.topic))];

  return (
    <div className="muse-col" style={{ padding: '16px 20px 0' }}>
      <div className="muse-stage-scroll" role="tablist" aria-label="Stages">
        {STAGES.map((s) => (
          <button key={s.id} type="button" className={`muse-stage-chip${s.id === st.id ? ' active' : ''}`} style={{ '--c': s.color }} onClick={() => { setViewId(s.id); setOpenStep(0); }}>
            {s.emoji} {s.label.split(' ')[0]}{s.id === currentStage.id ? ' •' : ''}
          </button>
        ))}
      </div>

      {p && (
        <>
          <section className="card muse-card muse-goal" style={{ '--stage': st.color }}>
            <div className="muse-label">{st.emoji} {st.label.toUpperCase()} · THE GOAL</div>
            <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.4, margin: '8px 0 10px' }}>{p.goal}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <span className="muse-chip" style={{ '--c': st.color }}>⏱ about {p.days} days</span>
              <span className="muse-chip muse-chip-plain">{p.steps.length} steps</span>
              <span className="muse-chip muse-chip-plain">✅ {ready}/{p.gate.length} ready</span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className="btn-primary muse-send" style={{ flex: 1 }} onClick={() => onSchedule(st.id)}>🗓️ Schedule this stage</button>
              <button className="btn-ghost" style={{ width: 'auto', padding: '0 14px' }} onClick={() => onAsk(`I'm working on the ${st.label} stage. Looking at what I've done so far, what should I do first and what am I likely missing?`)}>Ask Muse</button>
            </div>
          </section>

          <section className="card muse-card">
            <div className="muse-label">🧭 STEP BY STEP</div>
            <div className="muse-steps">
              {p.steps.map((s, i) => {
                const open = openStep === i;
                return (
                  <div key={s.title} className={`muse-step-row${open ? ' open' : ''}`} style={{ '--stage': st.color }}>
                    <button type="button" className="muse-step-head" onClick={() => setOpenStep(open ? -1 : i)}>
                      <span className="muse-check">{i + 1}</span>
                      <span style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{s.title}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{s.minutes >= 60 ? `${Math.round(s.minutes / 60 * 10) / 10}h` : `${s.minutes}m`}</span>
                    </button>
                    {open && (
                      <ul className="muse-how">
                        {s.how.map((h) => <li key={h}>{h}</li>)}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card muse-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="muse-label">🚦 READY TO MOVE ON WHEN…</div>
              <div className="font-num" style={{ fontSize: 12, color: ready === p.gate.length ? 'var(--green)' : 'var(--text-3)' }}>{ready}/{p.gate.length}</div>
            </div>
            <div className="muse-tasks">
              {p.gate.map((g, i) => (
                <button key={g} type="button" className={`muse-task${gates[i] ? ' done' : ''}`} style={{ '--stage': st.color }} onClick={() => toggleGate(i)}>
                  <span className="muse-check">{gates[i] ? '✓' : ''}</span>
                  <span className="muse-task-text" style={{ flex: 1 }}>{g}</span>
                </button>
              ))}
            </div>
            {ready === p.gate.length && <div style={{ fontSize: 12.5, color: 'var(--green)', marginTop: 10 }}>🎉 You've passed the {st.label} gate. Make sure its questions in Journey are answered, then move on.</div>}
          </section>

          <section className="card muse-card">
            <div className="muse-label">⚠️ COMMON MISTAKES</div>
            <ul className="muse-how" style={{ marginTop: 8 }}>
              {p.mistakes.map((m) => <li key={m}>{m}</li>)}
            </ul>
          </section>

          <section className="card muse-card">
            <div className="muse-label">📚 READ FOR THIS STAGE</div>
            <div className="muse-reads">
              {p.reads.map((r) => (
                <a key={r.url} href={r.url} target="_blank" rel="noopener noreferrer" className="muse-read">
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{r.title} <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>↗</span></div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '2px 0 4px' }}>{r.author}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.45 }}>{r.idea}</div>
                </a>
              ))}
            </div>
          </section>
        </>
      )}

      <section className="card muse-card">
        <div className="muse-label">🏛️ FOUNDER LIBRARY</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', margin: '6px 0 4px' }}>The guides this playbook is built on. Muse coaches with the same ideas.</div>
        {topics.map((t) => (
          <div key={t} style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-2)', letterSpacing: 0.6, marginBottom: 6 }}>{t.toUpperCase()}</div>
            {LIBRARY.filter((l) => l.topic === t).map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="muse-lib-row">
                <span style={{ flex: 1, minWidth: 0 }}>{l.title}</span>
                <span style={{ color: 'var(--text-3)', fontSize: 11.5, flexShrink: 0 }}>{l.author} ↗</span>
              </a>
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}
