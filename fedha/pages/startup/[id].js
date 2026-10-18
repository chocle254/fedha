import { useState, useEffect, useRef } from 'react';
import { fireConfetti } from '../../lib/confetti';
import { genId, todayISO, localISO } from '../../lib/utils';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import { useApp } from '../../context/AppContext';
import { STAGES, NUDGES, stageProgress, streakOf, journeyState, openQuestions, museNotice, fallbackPlan } from '../../lib/startup';

// The startup page works like a personal agent ("Muse"): it asks you the next
// question, breaks your stage into a plan, checks back in when you go quiet,
// and answers questions about your startup.

function MuseOrb({ size = 40, busy = false }) {
  return <div className={`muse-orb${busy ? ' busy' : ''}`} style={{ width: size, height: size }} aria-hidden="true" />;
}

function Ring({ pct, color, size = 64 }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <div className="font-num" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size > 56 ? 15 : 12, fontWeight: 700 }}>{pct}%</div>
    </div>
  );
}

const SUGGESTIONS = [
  'What should I focus on this week?',
  'How do I get my first 10 users?',
  "What's the biggest risk in my idea?",
];

export default function StartupDetail() {
  const router = useRouter();
  const { id } = router.query;
  const { startups, updateStartup } = useApp();
  const startup = startups.find((s) => s.id === id);

  const [openStage, setOpenStage] = useState(null);
  const [draft, setDraft] = useState({});
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [focusDraft, setFocusDraft] = useState('');
  const [focusDue, setFocusDue] = useState('');
  const [logDraft, setLogDraft] = useState('');
  const [editingMission, setEditingMission] = useState(false);
  const [missionDraft, setMissionDraft] = useState('');
  // Muse
  const [answer, setAnswer] = useState('');
  const [skipIdx, setSkipIdx] = useState(0);
  const [ack, setAck] = useState('');
  const [planBusy, setPlanBusy] = useState(false);
  const [planNote, setPlanNote] = useState('');
  const [chatDraft, setChatDraft] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatErr, setChatErr] = useState('');

  const fieldRefs = useRef({});
  const logRef = useRef(null);
  const focusRef = useRef(null);
  const planRef = useRef(null);
  const chatEndRef = useRef(null);
  const latest = useRef(startup);
  if (startup && latest.current?.id !== startup.id) latest.current = startup;
  useEffect(() => { if (startup) latest.current = startup; }, [startup]);

  // Sync local draft from the persisted startup once it loads.
  useEffect(() => { if (startup) setDraft(startup.stages || {}); }, [startup?.id]);

  const chatLen = startup?.chat?.length || 0;
  useEffect(() => {
    const el = chatEndRef.current;
    if (el && el.parentElement) el.parentElement.scrollTop = el.parentElement.scrollHeight;
  }, [chatLen, chatBusy]);

  if (!startup) {
    return (
      <Layout fab={false}>
        <div className="page" style={{ padding: '80px 20px' }}>
          <div className="empty-state"><div className="icon">💡</div><h3>Startup not found</h3><p>It may have been deleted.</p></div>
          <button className="btn-primary" onClick={() => router.push('/tech-hub')}>← Back to Tech Hub</button>
        </div>
      </Layout>
    );
  }

  // Always build on the newest copy, so two quick saves don't undo each other.
  const save = (patch) => {
    const next = { ...(latest.current || startup), ...patch };
    latest.current = next;
    return updateStartup(next);
  };

  function setField(stageId, key, value) {
    setDraft((d) => ({ ...d, [stageId]: { ...(d[stageId] || {}), [key]: value } }));
  }
  function saveStage(stageId) {
    save({ stages: { ...((latest.current || startup).stages || {}), [stageId]: draft[stageId] || {} } });
  }

  const { allDone, currentIdx: currentStageIdx, stage, pct: totalPct } = journeyState(draft);
  const questions = allDone ? [] : openQuestions(draft, stage);
  const question = questions.length ? questions[skipIdx % questions.length] : null;
  const nextField = questions[0] || null;
  const mission = startup.mission || draft.ideation?.solution || draft.ideation?.problem || '';
  const focus = startup.focus || null;
  const focusDaysLeft = focus?.due ? Math.ceil((new Date(focus.due + 'T23:59:59') - new Date()) / 86400000) : null;
  const log = startup.log || [];
  const streak = streakOf(log);
  const last7 = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); const iso = localISO(d); return { iso, on: log.some((l) => l.date === iso), label: d.toLocaleDateString('en-GB', { weekday: 'narrow' }) }; });
  const nudgeList = NUDGES[stage.id] || NUDGES.ideation;
  const nudge = nudgeList[new Date().getDate() % nudgeList.length];
  const notice = museNotice({ ...startup, stages: draft });
  const plan = startup.plan || null;
  const planDone = plan?.tasks?.filter((t) => t.done).length || 0;
  const chat = startup.chat || [];

  // ── Muse asks, you answer ──
  function answerQuestion() {
    const text = answer.trim();
    if (!text || !question) return;
    const next = { ...draft, [stage.id]: { ...(draft[stage.id] || {}), [question.key]: text } };
    setDraft(next);
    save({ stages: next });
    setAnswer('');
    setSkipIdx(0);
    const after = journeyState(next);
    if (after.allDone) {
      setAck('🏁 That was the last question — every stage is mapped. Get a full analysis below.');
      try { fireConfetti({ count: 160 }); } catch {}
    } else if (after.stage.id !== stage.id) {
      setAck(`🎉 ${stage.label} is fully mapped. On to ${after.stage.label}.`);
      try { fireConfetti({ count: 120 }); } catch {}
    } else {
      const left = openQuestions(next, stage).length;
      setAck(`Saved to ${stage.label} ✓ — ${left} question${left === 1 ? '' : 's'} left in this stage.`);
    }
  }

  // ── Plan ──
  async function makePlan() {
    if (planBusy) return;
    setPlanBusy(true); setPlanNote('');
    let tasks;
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'startup_plan', startup: { ...startup, chat: undefined, stages: draft }, stage: { label: stage.label, blurb: stage.blurb, fields: stage.fields.map((f) => ({ label: f.label })) } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.tasks?.length) throw new Error(data.error || 'No plan');
      tasks = data.tasks;
    } catch {
      tasks = fallbackPlan(draft, stage);
      setPlanNote("Couldn't reach the AI, so this plan is built from the stage's questions. Try again later for a smarter one.");
    }
    save({ plan: { stage: stage.id, stage_label: stage.label, created: todayISO(), tasks: tasks.map((t) => ({ id: genId(), text: t.text, why: t.why || '', done: false })) } });
    setPlanBusy(false);
    setTimeout(() => planRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }
  function togglePlanTask(t) {
    const tasks = plan.tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done, done_at: !x.done ? todayISO() : null } : x));
    const patch = { plan: { ...plan, tasks } };
    if (!t.done) {
      patch.log = [{ id: genId(), date: todayISO(), text: `☑️ ${t.text}` }, ...((latest.current || startup).log || [])].slice(0, 200);
      if (tasks.every((x) => x.done)) { try { fireConfetti({ count: 140 }); } catch {} }
    }
    save(patch);
  }

  // ── Ask Muse ──
  async function ask(preset) {
    const text = String(preset ?? chatDraft).trim();
    if (!text || chatBusy) return;
    const history = (latest.current || startup).chat || [];
    const mine = { id: genId(), role: 'user', text, at: Date.now() };
    save({ chat: [...history, mine].slice(-30) });
    setChatDraft(''); setChatErr(''); setChatBusy(true);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'startup_chat', startup: { ...startup, chat: undefined, stages: draft }, question: text, history: history.slice(-8) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.reply) throw new Error(data.error || 'No reply');
      const cur = (latest.current || startup).chat || [];
      save({ chat: [...cur, { id: genId(), role: 'muse', text: data.reply, at: Date.now() }].slice(-30) });
    } catch (e) {
      setChatErr(`I couldn't think that through right now (${e.message}). Tap send again in a moment.`);
      setChatDraft(text);
    } finally {
      setChatBusy(false);
    }
  }

  function runNotice(action) {
    if (action === 'plan') return makePlan();
    const el = action === 'log' ? logRef.current : focusRef.current;
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus({ preventScroll: true }); }
    else if (action === 'focus') document.getElementById('muse-commit')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ── Commitment & log ──
  function setFocus() {
    if (!focusDraft.trim()) return;
    const due = focusDue || (() => { const d = new Date(); d.setDate(d.getDate() + 7); return localISO(d); })();
    save({ focus: { text: focusDraft.trim(), due, done: false, set_at: todayISO() } });
    setFocusDraft(''); setFocusDue('');
  }
  function completeFocus() {
    const entry = { id: genId(), date: todayISO(), text: `✅ Commitment done: ${focus.text}` };
    save({ focus: { ...focus, done: true, done_at: todayISO() }, log: [entry, ...log].slice(0, 200), wins: (startup.wins || 0) + 1 });
    try { fireConfetti({ count: 140 }); } catch {}
  }
  function addLog() {
    if (!logDraft.trim()) return;
    save({ log: [{ id: genId(), date: todayISO(), text: logDraft.trim() }, ...log].slice(0, 200) });
    setLogDraft('');
  }
  function goToField(st, f) {
    setOpenStage(st.id);
    setTimeout(() => {
      const el = fieldRefs.current[`${st.id}.${f.key}`];
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus({ preventScroll: true }); }
    }, 60);
  }

  async function generateAnalysis() {
    setLoadingAnalysis(true);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'startup_analysis', startup: { name: startup.name, accelerator: startup.accelerator, stages: draft } }),
      });
      const data = await res.json();
      if (!res.ok || !data.analysis) throw new Error(data.error || 'No analysis');
      setAnalysis(data.analysis);
      setShowAnalysis(true);
    } catch (err) {
      console.error('Analysis error:', err);
      alert('Failed to generate analysis');
    } finally {
      setLoadingAnalysis(false);
    }
  }

  return (
    <Layout fab={false}>
      <div className="page muse-page">
        <div className="page-top" style={{ padding: '52px 20px 0' }}>
          <button onClick={() => router.push('/tech-hub?tab=startups')} className="muse-back">← Startups</button>

          {/* ── HERO ── */}
          <div className="muse-hero" style={{ '--stage': stage.color }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className="muse-hero-icon">{stage.emoji}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="muse-title">{startup.name}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  <span className="muse-chip" style={{ '--c': stage.color }}>{allDone ? '🏁 Fully mapped' : `${stage.label} · ${currentStageIdx + 1}/${STAGES.length}`}</span>
                  {startup.accelerator && <span className="muse-chip muse-chip-plain">🏛 {startup.accelerator}</span>}
                  {streak > 0 && <span className="muse-chip muse-chip-plain">🔥 {streak}d</span>}
                </div>
              </div>
              <Ring pct={totalPct} color={stage.color} />
            </div>

            <div className="muse-path" aria-label="Startup journey">
              {STAGES.map((st, i) => {
                const pct = stageProgress(draft[st.id], st.fields);
                const state = pct === 100 ? 'done' : i === currentStageIdx && !allDone ? 'now' : 'todo';
                return (
                  <button key={st.id} type="button" className={`muse-step muse-step-${state}`} style={{ '--c': st.color }}
                    onClick={() => { setOpenStage(st.id); setTimeout(() => document.getElementById(`stage-${st.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); }}
                    title={`${st.label} — ${pct}%`}>
                    <span>{state === 'done' ? '✓' : st.emoji}</span>
                  </button>
                );
              })}
            </div>
            <div className="muse-path-label">{allDone ? 'Every stage done' : stage.blurb}</div>

            <div className="muse-northstar">
              <div className="muse-label">⭐ NORTH STAR</div>
              {editingMission ? (
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <input className="input" autoFocus value={missionDraft} onChange={(e) => setMissionDraft(e.target.value)} placeholder="One sentence: who you help and how" style={{ flex: 1 }} />
                  <button className="btn-primary" style={{ width: 'auto', padding: '0 14px' }} onClick={() => { save({ mission: missionDraft.trim() }); setEditingMission(false); }}>Save</button>
                </div>
              ) : (
                <button type="button" className="muse-mission" onClick={() => { setMissionDraft(mission); setEditingMission(true); }}>
                  {mission ? `“${mission}”` : 'Tap to write your mission in one sentence — the reason this exists.'}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="muse-grid">
          <div className="muse-col">
            {/* ── MUSE: check-in + next question ── */}
            <section className="muse-agent" style={{ '--stage': stage.color }}>
              <div className="muse-agent-head">
                <MuseOrb size={38} busy={planBusy || chatBusy} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>Muse</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Your co-founder for {startup.name}</div>
                </div>
                <span className="muse-status"><i />{planBusy || chatBusy ? 'Thinking…' : allDone ? 'All mapped' : `On ${stage.label}`}</span>
              </div>

              {notice && (
                <div className={`muse-bubble muse-notice muse-tone-${notice.tone}`}>
                  <div className="muse-bubble-kicker">{notice.tone === 'warn' ? 'CHECKING IN' : notice.tone === 'win' ? 'NICE WORK' : 'A SUGGESTION'}</div>
                  <div>{notice.text}</div>
                  <button type="button" className="muse-link" onClick={() => runNotice(notice.action)} disabled={planBusy}>
                    {notice.action === 'plan' ? (planBusy ? 'Making a plan…' : 'Make the plan →') : notice.action === 'log' ? 'Log progress →' : 'Set a commitment →'}
                  </button>
                </div>
              )}

              {ack && <div className="muse-bubble muse-ack">{ack}</div>}

              {question ? (
                <div className="muse-bubble">
                  <div className="muse-bubble-kicker">QUESTION FOR {stage.label.toUpperCase()}{questions.length > 1 ? ` · ${questions.length} LEFT` : ''}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, margin: '2px 0 4px' }}>{question.label}</div>
                  <div style={{ color: 'var(--text-2)' }}>{question.placeholder}</div>
                </div>
              ) : (
                <div className="muse-bubble">Every stage of the journey is written down. Ask me anything below, or get a full analysis at the bottom.</div>
              )}

              {question && (
                <div className="muse-answer">
                  <textarea className="input" rows={2} placeholder="Type your answer…" value={answer}
                    onChange={(e) => { setAnswer(e.target.value); if (ack) setAck(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) answerQuestion(); }} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className="btn-primary muse-send" style={{ flex: 1 }} disabled={!answer.trim()} onClick={answerQuestion}>Answer ↑</button>
                    {questions.length > 1 && <button className="btn-ghost" style={{ width: 'auto', padding: '0 14px' }} onClick={() => { setSkipIdx((i) => i + 1); setAnswer(''); setAck(''); }}>Skip</button>}
                    <button className="btn-ghost" style={{ width: 'auto', padding: '0 14px' }} onClick={() => ask(`Help me answer this for ${startup.name}: ${question.label} — ${question.placeholder}`)} disabled={chatBusy}>Help me</button>
                  </div>
                </div>
              )}
            </section>

            {/* ── PLAN ── */}
            <section ref={planRef} className="card muse-card" style={{ '--stage': stage.color }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div className="muse-label">🗺️ {plan ? `PLAN · ${String(plan.stage_label || '').toUpperCase()}` : 'THE PLAN'}</div>
                {plan?.tasks?.length > 0 && <div className="font-num" style={{ fontSize: 12, color: 'var(--text-3)' }}>{planDone}/{plan.tasks.length}</div>}
              </div>
              {plan?.tasks?.length ? (
                <>
                  <div className="muse-bar"><div style={{ width: `${Math.round((planDone / plan.tasks.length) * 100)}%` }} /></div>
                  <div className="muse-tasks">
                    {plan.tasks.map((t, i) => (
                      <button key={t.id} type="button" className={`muse-task${t.done ? ' done' : ''}`} onClick={() => togglePlanTask(t)}>
                        <span className="muse-check">{t.done ? '✓' : i + 1}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span className="muse-task-text">{t.text}</span>
                          {t.why && <span className="muse-task-why">{t.why}</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                  <button className="muse-link" style={{ marginTop: 10 }} onClick={makePlan} disabled={planBusy}>{planBusy ? 'Re-planning…' : `↻ New plan for ${stage.label}`}</button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: 'var(--text-2)', margin: '8px 0 12px', lineHeight: 1.5 }}>
                    Muse breaks <b style={{ color: 'var(--text)' }}>{stage.label}</b> into 4–6 small steps you can tick off. Each tick counts toward your streak.
                  </div>
                  <button className="btn-primary muse-send" onClick={makePlan} disabled={planBusy}>{planBusy ? 'Thinking…' : '✨ Make my plan'}</button>
                </>
              )}
              {planNote && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8 }}>{planNote}</div>}
            </section>

            {/* ── ASK MUSE ── */}
            <section className="card muse-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="muse-label">💬 ASK MUSE</div>
                {chat.length > 0 && <button className="muse-link" style={{ fontSize: 11.5 }} onClick={() => { if (window.confirm('Clear this conversation?')) save({ chat: [] }); }}>Clear</button>}
              </div>
              {chat.length > 0 || chatBusy ? (
                <div className="muse-chat">
                  {chat.map((m) => (
                    <div key={m.id} className={`muse-msg ${m.role === 'user' ? 'me' : 'them'}`}>
                      {m.role !== 'user' && <MuseOrb size={22} />}
                      <div className="muse-msg-body">{m.text}</div>
                    </div>
                  ))}
                  {chatBusy && <div className="muse-msg them"><MuseOrb size={22} busy /><div className="muse-msg-body muse-typing"><i /><i /><i /></div></div>}
                  <div ref={chatEndRef} />
                </div>
              ) : (
                <div className="muse-suggest">
                  {[...SUGGESTIONS, ...(nextField ? [`Help me with my ${nextField.label.toLowerCase()}`] : [])].map((s) => (
                    <button key={s} type="button" onClick={() => ask(s)}>{s}</button>
                  ))}
                </div>
              )}
              {chatErr && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>{chatErr}</div>}
              <div className="muse-compose">
                <input className="input" placeholder={`Ask anything about ${startup.name}…`} value={chatDraft} onChange={(e) => setChatDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask()} />
                <button type="button" className="muse-send-round" disabled={!chatDraft.trim() || chatBusy} onClick={() => ask()} aria-label="Send">↑</button>
              </div>
            </section>
          </div>

          <div className="muse-col">
            {/* ── THIS WEEK'S COMMITMENT ── */}
            <section id="muse-commit" className="card muse-card">
              <div className="muse-label">🎯 THIS WEEK'S COMMITMENT</div>
              {focus && !focus.done ? (
                <>
                  <div style={{ fontSize: 16, fontWeight: 700, margin: '8px 0 4px', lineHeight: 1.35 }}>{focus.text}</div>
                  <div style={{ fontSize: 12, color: focusDaysLeft != null && focusDaysLeft <= 1 ? 'var(--red)' : 'var(--text-3)' }}>
                    {focusDaysLeft == null ? '' : focusDaysLeft < 0 ? `${-focusDaysLeft} day${focusDaysLeft === -1 ? '' : 's'} overdue — finish it or reset it honestly.` : focusDaysLeft === 0 ? 'Due today.' : `${focusDaysLeft} day${focusDaysLeft === 1 ? '' : 's'} left.`}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button className="btn-primary" style={{ flex: 1 }} onClick={completeFocus}>✓ I did it</button>
                    <button className="btn-ghost" style={{ width: 'auto', padding: '0 14px' }} onClick={() => save({ focus: null })}>Change</button>
                  </div>
                </>
              ) : (
                <>
                  {focus?.done && <div style={{ fontSize: 13, color: 'var(--green)', margin: '8px 0 2px' }}>Last one done: {focus.text} 🎉</div>}
                  <div style={{ fontSize: 12, color: 'var(--text-3)', margin: '6px 0 10px' }}>One concrete thing you'll finish in the next 7 days. Small and done beats big and vague.</div>
                  <input ref={focusRef} className="input" placeholder={plan?.tasks?.find((t) => !t.done) ? `e.g. ${plan.tasks.find((t) => !t.done).text}` : 'e.g. Interview 5 potential users'} value={focusDraft} onChange={(e) => setFocusDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setFocus()} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input className="input" type="date" value={focusDue} onChange={(e) => setFocusDue(e.target.value)} style={{ flex: 1 }} aria-label="Due date (default 7 days)" />
                    <button className="btn-primary" style={{ width: 'auto', padding: '0 16px' }} disabled={!focusDraft.trim()} onClick={setFocus}>Commit</button>
                  </div>
                </>
              )}
              {(startup.wins || 0) > 0 && <div style={{ fontSize: 11, color: 'var(--gold)', marginTop: 10 }}>🏆 {startup.wins} commitment{startup.wins === 1 ? '' : 's'} kept so far</div>}
            </section>

            {/* ── MOMENTUM ── */}
            <section className="card muse-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="muse-label">🔥 MOMENTUM</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: streak ? 'var(--yellow)' : 'var(--text-3)' }}>{streak ? `${streak}-day streak` : 'No streak yet'}</div>
              </div>
              <div className="muse-week">
                {last7.map((d) => <div key={d.iso} className={`muse-day${d.on ? ' on' : ''}`}><span>{d.label}</span></div>)}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input ref={logRef} className="input" placeholder="What did you move forward today?" value={logDraft} onChange={(e) => setLogDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addLog()} style={{ flex: 1 }} />
                <button className="btn-primary" style={{ width: 'auto', padding: '0 14px' }} disabled={!logDraft.trim()} onClick={addLog}>Log</button>
              </div>
              {log.length > 0 && (
                <div className="muse-log">
                  {log.slice(0, 5).map((l) => (
                    <div key={l.id} className="muse-log-row">
                      <span className="font-num" style={{ color: 'var(--text-3)', flexShrink: 0, width: 40 }}>{l.date.slice(5).split('-').reverse().join('/')}</span>
                      <span style={{ color: 'var(--text-2)' }}>{l.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="muse-nudge" style={{ '--stage': stage.color }}>
              <span style={{ fontSize: 18 }}>💡</span>
              <span>{nudge}</span>
            </div>
          </div>
        </div>

        {/* ── JOURNEY ── */}
        <div style={{ padding: '24px 20px 0' }}>
          <div className="section-title" style={{ marginBottom: 12 }}>Startup Journey</div>
          <div className="muse-stages">
            {STAGES.map((st, idx) => {
              const open = openStage === st.id;
              const pct = stageProgress(draft[st.id], st.fields);
              return (
                <div key={st.id} id={`stage-${st.id}`} className={`muse-stage${open ? ' open' : ''}${pct === 100 ? ' done' : ''}`} style={{ '--c': st.color }}>
                  <button onClick={() => setOpenStage(open ? null : st.id)} className="muse-stage-head">
                    <div className="muse-stage-icon">{pct === 100 ? '✓' : st.emoji}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                        <span style={{ color: st.color }}>{idx + 1}.</span> {st.label}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{st.blurb}</div>
                      <div className="muse-stage-bar"><div style={{ width: `${pct}%` }} /></div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div className="font-num" style={{ fontSize: 13, fontWeight: 700, color: pct === 100 ? 'var(--green)' : 'var(--text-3)' }}>{pct}%</div>
                      <div style={{ fontSize: 16, color: 'var(--text-3)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</div>
                    </div>
                  </button>

                  {open && (
                    <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {st.fields.map((f) => (
                        <div key={f.key}>
                          <label style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>{f.label}</label>
                          <textarea
                            ref={(el) => { fieldRefs.current[`${st.id}.${f.key}`] = el; }}
                            className="input"
                            placeholder={f.placeholder}
                            value={draft[st.id]?.[f.key] || ''}
                            onChange={(e) => setField(st.id, f.key, e.target.value)}
                            rows={2}
                            style={{ resize: 'vertical', minHeight: 56, lineHeight: 1.5 }}
                          />
                        </div>
                      ))}
                      <button className="btn-secondary" onClick={() => saveStage(st.id)} style={{ marginTop: 8 }}>Save Stage</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── ANALYSIS ── */}
        <div style={{ padding: '24px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>Progress & Analysis</div>
            <div className="font-num" style={{ fontSize: 14, fontWeight: 700, color: totalPct === 100 ? 'var(--green)' : 'var(--text-2)' }}>{totalPct}%</div>
          </div>

          <div className="card muse-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="muse-bar muse-bar-rainbow" style={{ margin: 0 }}><div style={{ width: `${totalPct}%` }} /></div>
            <button className="btn-primary muse-send" onClick={generateAnalysis} disabled={totalPct < 25 || loadingAnalysis}
              style={{ cursor: totalPct < 25 ? 'not-allowed' : 'pointer', opacity: totalPct < 25 ? 0.5 : 1 }}>
              {loadingAnalysis ? 'Analyzing…' : '✨ Get AI Analysis'}
            </button>
            {totalPct < 25 && (
              <div style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>
                Fill at least 25% of the journey to unlock analysis{nextField ? <> — <button className="muse-link" onClick={() => goToField(stage, nextField)}>answer the next question</button></> : null}
              </div>
            )}
          </div>

          {showAnalysis && analysis && (
            <div style={{ marginTop: 20 }}>
              <button onClick={() => setShowAnalysis(false)} className="muse-back">← Hide Analysis</button>
              <div className="card muse-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)', marginBottom: 8 }}>✓ Why This Is a Good Idea</div>
                  <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{analysis.strengths}</div>
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#EF4444', marginBottom: 8 }}>⚠️ Why This Could Be Risky</div>
                  <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{analysis.risks}</div>
                </div>
                {analysis.competitors && analysis.competitors.length > 0 && (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>🏆 Similar Apps & Your Competitive Edge</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {analysis.competitors.map((comp, idx) => (
                        <div key={idx} style={{ padding: 10, background: 'var(--bg-2)', borderRadius: 10, borderLeft: '3px solid var(--blue)' }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{comp.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{comp.description}</div>
                          <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 6, fontStyle: 'italic' }}>Your edge: {comp.your_edge}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>→ Recommended Next Steps</div>
                  <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{analysis.next_steps}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
