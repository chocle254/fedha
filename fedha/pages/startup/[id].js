import { useState, useEffect, useRef } from 'react';
import { fireConfetti } from '../../lib/confetti';
import { genId, todayISO, localISO } from '../../lib/utils';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import { useApp } from '../../context/AppContext';
import { STAGES, NUDGES, stageProgress, streakOf, journeyState, openQuestions, museNotice, roadmapOf, dueTasks, fallbackRoadmap, addDaysISO } from '../../lib/startup';
import { PLAYBOOK } from '../../lib/founder-playbook';
import { museAsk, startupForAI } from '../../components/startup/museApi';
import PlaybookTab from '../../components/startup/PlaybookTab';
import NotebookTab from '../../components/startup/NotebookTab';
import PitchTab from '../../components/startup/PitchTab';
import CustomersTab from '../../components/startup/CustomersTab';
import InvestorTab from '../../components/startup/InvestorTab';
import ReadinessTab from '../../components/startup/ReadinessTab';

// The startup page is a workspace run by an agent ("Muse"): it asks you the
// next question, schedules each stage into the planner as a dated roadmap,
// coaches from the founder playbook, drafts and judges your pitch, plays
// investors, and tests how ready you are.

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

const TABS = [
  ['muse', '✨ Muse'],
  ['playbook', '🧭 Playbook'],
  ['customers', '💰 Customers'],
  ['pitch', '🎤 Pitch'],
  ['investors', '💼 Investors'],
  ['readiness', '🧪 Readiness'],
  ['notebook', '📓 Notebook'],
  ['journey', '🗺️ Journey'],
];

const SUGGESTIONS = [
  'What should I focus on this week?',
  'How do I get my first 10 users?',
  "What's the biggest risk in my idea?",
];

function dayLabel(iso, today) {
  if (!iso) return 'Anytime';
  if (iso < today) return 'Overdue';
  if (iso === today) return 'Today';
  if (iso === addDaysISO(today, 1)) return 'Tomorrow';
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
const fmtMin = (m) => (m >= 60 ? `${Math.round((m / 60) * 10) / 10}h` : `${m}m`);

export default function StartupDetail() {
  const router = useRouter();
  const { id } = router.query;
  const { startups, updateStartup } = useApp();
  const startup = startups.find((s) => s.id === id);

  const [tab, setTab] = useState('muse');
  const [openStage, setOpenStage] = useState(null);
  const [playbookStage, setPlaybookStage] = useState(null);
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
  const [chatDraft, setChatDraft] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatErr, setChatErr] = useState('');
  // Roadmap
  const [schedOpen, setSchedOpen] = useState(false);
  const [schedStage, setSchedStage] = useState(null);
  const [schedHours, setSchedHours] = useState(null);
  const [schedStart, setSchedStart] = useState('');
  const [schedBusy, setSchedBusy] = useState(false);
  const [schedNote, setSchedNote] = useState('');
  const [openTask, setOpenTask] = useState(null);
  const [showAllTasks, setShowAllTasks] = useState(false);

  const fieldRefs = useRef({});
  const logRef = useRef(null);
  const focusRef = useRef(null);
  const roadmapRef = useRef(null);
  const todayRef = useRef(null);
  const chatRef = useRef(null);
  const chatEndRef = useRef(null);
  const latest = useRef(startup);
  if (startup && latest.current?.id !== startup.id) latest.current = startup;
  useEffect(() => { if (startup) latest.current = startup; }, [startup]);

  useEffect(() => { if (startup) setDraft(startup.stages || {}); }, [startup?.id]);
  useEffect(() => {
    const t = router.query.tab;
    if (typeof t === 'string' && TABS.some(([k]) => k === t)) setTab(t);
  }, [router.query.tab]);

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
  const cur = () => latest.current || startup;

  function goTab(k) {
    setTab(k);
    router.replace({ pathname: router.pathname, query: { ...router.query, tab: k } }, undefined, { shallow: true });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  const scrollTo = (ref) => setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);

  function setField(stageId, key, value) {
    setDraft((d) => ({ ...d, [stageId]: { ...(d[stageId] || {}), [key]: value } }));
  }
  function saveStage(stageId) {
    save({ stages: { ...(cur().stages || {}), [stageId]: draft[stageId] || {} } });
  }

  const today = todayISO();
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
  const roadmap = roadmapOf(startup);
  const tasks = roadmap?.tasks || [];
  const tasksDone = tasks.filter((t) => t.done).length;
  const due = dueTasks(roadmap, today);
  const upcoming = tasks.filter((t) => !t.done && !(t.date && t.date <= today));
  const chat = startup.chat || [];
  const hoursDefault = startup.hours_per_day || 2;

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
      setAck('🏁 That was the last question — every stage is mapped. Run the Readiness test next.');
      try { fireConfetti({ count: 160 }); } catch {}
    } else if (after.stage.id !== stage.id) {
      setAck(`🎉 ${stage.label} is fully mapped. On to ${after.stage.label} — check its Playbook and let me schedule it.`);
      try { fireConfetti({ count: 120 }); } catch {}
    } else {
      const left = openQuestions(next, stage).length;
      setAck(`Saved to ${stage.label} ✓ — ${left} question${left === 1 ? '' : 's'} left in this stage.`);
    }
  }

  // ── Roadmap (goes into the planner) ──
  function openScheduler(stageId) {
    setSchedStage(stageId || stage.id);
    setSchedHours(null);
    setSchedStart('');
    setSchedOpen(true);
    if (tab !== 'muse') goTab('muse');
    scrollTo(roadmapRef);
  }
  async function makeRoadmap() {
    if (schedBusy) return;
    const stId = schedStage || stage.id;
    const st = STAGES.find((s) => s.id === stId) || stage;
    const hours = schedHours || hoursDefault;
    const start = schedStart || today;
    if (tasks.some((t) => !t.done) && !window.confirm(`Replace your current roadmap (${tasks.length - tasksDone} task${tasks.length - tasksDone === 1 ? '' : 's'} left) with a new one for ${st.label}?`)) return;
    setSchedBusy(true); setSchedNote('');
    let out;
    try {
      const r = await museAsk('startup_roadmap', { startup: startupForAI(cur(), draft), stageId: stId, start_date: start, hours_per_day: hours });
      out = r.tasks;
    } catch (e) {
      out = fallbackRoadmap(stId, PLAYBOOK, start);
      setSchedNote(`Couldn't reach the AI (${e.message}), so this roadmap follows the playbook steps. Re-plan later for one tailored to ${startup.name}.`);
    }
    save({
      roadmap: { stage: st.id, stage_label: st.label, created: today, hours_per_day: hours, tasks: out.map((t) => ({ id: genId(), title: t.title, how: t.how || [], minutes: t.minutes || 60, date: t.date, time: t.time || null, done: false })) },
      plan: null,
      hours_per_day: hours,
    });
    setSchedBusy(false);
    setSchedOpen(false);
    setShowAllTasks(true);
    try { fireConfetti({ count: 60 }); } catch {}
    scrollTo(todayRef);
  }
  function patchTask(t, patch) {
    const rm = roadmapOf(cur());
    if (!rm) return;
    save({ roadmap: { ...rm, tasks: rm.tasks.map((x) => (x.id === t.id ? { ...x, ...patch } : x)) }, plan: null });
  }
  function toggleTask(t) {
    const rm = roadmapOf(cur());
    const nextTasks = rm.tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done, done_at: !x.done ? today : null } : x));
    const patch = { roadmap: { ...rm, tasks: nextTasks }, plan: null };
    if (!t.done) {
      patch.log = [{ id: genId(), date: today, text: `☑️ ${t.title}` }, ...(cur().log || [])].slice(0, 200);
      if (nextTasks.every((x) => x.done)) { try { fireConfetti({ count: 160 }); } catch {} }
    }
    save(patch);
  }
  function laterTask(t) {
    patchTask(t, { date: addDaysISO(t.date && t.date > today ? t.date : today, 1) });
  }
  function addTask({ title, how = [], minutes = 60 }) {
    const rm = roadmapOf(cur()) || { stage: stage.id, stage_label: stage.label, created: today, tasks: [] };
    const task = { id: genId(), title, how, minutes, date: addDaysISO(today, 1), time: null, done: false };
    save({ roadmap: { ...rm, tasks: [...rm.tasks, task].sort((a, b) => String(a.date || '9').localeCompare(String(b.date || '9'))) }, plan: null });
  }

  // ── Ask Muse ──
  async function ask(preset) {
    const text = String(preset ?? chatDraft).trim();
    if (!text || chatBusy) return;
    if (tab !== 'muse') goTab('muse');
    const history = cur().chat || [];
    save({ chat: [...history, { id: genId(), role: 'user', text, at: Date.now() }].slice(-30) });
    setChatDraft(''); setChatErr(''); setChatBusy(true);
    scrollTo(chatRef);
    try {
      const r = await museAsk('startup_chat', { startup: startupForAI(cur(), draft), stageId: stage.id, question: text, history: history.slice(-8) });
      save({ chat: [...(cur().chat || []), { id: genId(), role: 'muse', text: r.reply, at: Date.now() }].slice(-30) });
    } catch (e) {
      setChatErr(`I couldn't think that through right now (${e.message}). Tap send again in a moment.`);
      setChatDraft(text);
    } finally {
      setChatBusy(false);
    }
  }

  function runNotice(action) {
    if (action === 'plan') return openScheduler(stage.id);
    if (action === 'today') return scrollTo(todayRef);
    const el = action === 'log' ? logRef.current : focusRef.current;
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus({ preventScroll: true }); }
    else if (action === 'focus') document.getElementById('muse-commit')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ── Commitment & log ──
  function setFocus() {
    if (!focusDraft.trim()) return;
    const dueDate = focusDue || addDaysISO(today, 7);
    save({ focus: { text: focusDraft.trim(), due: dueDate, done: false, set_at: today } });
    setFocusDraft(''); setFocusDue('');
  }
  function completeFocus() {
    const entry = { id: genId(), date: today, text: `✅ Commitment done: ${focus.text}` };
    save({ focus: { ...focus, done: true, done_at: today }, log: [entry, ...log].slice(0, 200), wins: (startup.wins || 0) + 1 });
    try { fireConfetti({ count: 140 }); } catch {}
  }
  function addLog() {
    if (!logDraft.trim()) return;
    save({ log: [{ id: genId(), date: today, text: logDraft.trim() }, ...log].slice(0, 200) });
    setLogDraft('');
  }
  function goToField(st, f) {
    if (tab !== 'journey') goTab('journey');
    setOpenStage(st.id);
    setTimeout(() => {
      const el = fieldRefs.current[`${st.id}.${f.key}`];
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus({ preventScroll: true }); }
    }, 120);
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

  function TaskRow({ t, compact }) {
    const open = openTask === t.id || (!compact && !t.done);
    const label = dayLabel(t.date, today);
    return (
      <div className={`muse-rtask${t.done ? ' done' : ''}`} style={{ '--stage': stage.color }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <button type="button" className="muse-check muse-check-btn" onClick={() => toggleTask(t)} aria-label={t.done ? 'Mark not done' : 'Mark done'}>{t.done ? '✓' : ''}</button>
          <button type="button" onClick={() => setOpenTask(openTask === t.id ? null : t.id)} style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit' }}>
            <span className="muse-task-text">{t.title}</span>
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              <span className={`muse-when${label === 'Overdue' ? ' late' : label === 'Today' ? ' now' : ''}`}>{label}{t.time ? ` · ${t.time}` : ''}</span>
              <span className="muse-when">⏱ {fmtMin(t.minutes || 60)}</span>
            </span>
          </button>
        </div>
        {open && t.how?.length > 0 && (
          <ol className="muse-how" style={{ marginLeft: 36 }}>
            {t.how.map((h, i) => <li key={i}>{h}</li>)}
          </ol>
        )}
        {open && !t.done && (
          <div style={{ display: 'flex', gap: 14, marginLeft: 36, marginTop: 4 }}>
            <button className="muse-link" onClick={() => toggleTask(t)}>✓ Done</button>
            <button className="muse-link" style={{ color: 'var(--text-2)' }} onClick={() => laterTask(t)}>Move to {t.date && t.date > today ? 'next day' : 'tomorrow'}</button>
            <button className="muse-link" style={{ color: 'var(--text-2)' }} onClick={() => ask(`Help me do this roadmap task well: "${t.title}". Steps I have: ${(t.how || []).join(' / ')}`)}>Help</button>
          </div>
        )}
      </div>
    );
  }

  const schedSt = STAGES.find((s) => s.id === (schedStage || stage.id)) || stage;

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
                  {startup.audit && <span className="muse-chip muse-chip-plain">🧪 {startup.audit.score}</span>}
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
                    onClick={() => { setPlaybookStage(st.id); goTab('playbook'); }}
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

        {/* ── TABS ── */}
        <div className="muse-tabs" role="tablist">
          {TABS.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => goTab(k)}>
              {label}
              {k === 'muse' && due.length > 0 && <span className="muse-badge">{due.length}</span>}
            </button>
          ))}
        </div>

        {tab === 'muse' && (
          <div className="muse-grid">
            <div className="muse-col">
              {/* ── MUSE: check-in + next question ── */}
              <section className="muse-agent" style={{ '--stage': stage.color }}>
                <div className="muse-agent-head">
                  <MuseOrb size={38} busy={schedBusy || chatBusy} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800 }}>Muse</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Your co-founder for {startup.name}</div>
                  </div>
                  <span className="muse-status"><i />{schedBusy || chatBusy ? 'Thinking…' : allDone ? 'All mapped' : `On ${stage.label}`}</span>
                </div>

                {notice && (
                  <div className={`muse-bubble muse-notice muse-tone-${notice.tone}`}>
                    <div className="muse-bubble-kicker">{notice.tone === 'warn' ? 'CHECKING IN' : notice.tone === 'win' ? 'NICE WORK' : 'A SUGGESTION'}</div>
                    <div>{notice.text}</div>
                    <button type="button" className="muse-link" onClick={() => runNotice(notice.action)} disabled={schedBusy}>
                      {notice.action === 'plan' ? 'Schedule it →' : notice.action === 'today' ? 'See today’s tasks →' : notice.action === 'log' ? 'Log progress →' : 'Set a commitment →'}
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
                  <div className="muse-bubble">Every stage of the journey is written down. Run the Readiness test, sharpen your Pitch, or ask me anything below.</div>
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

              {/* ── TODAY ── */}
              <section ref={todayRef} className="card muse-card" style={{ '--stage': stage.color, scrollMarginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="muse-label">📅 TODAY FOR {startup.name.toUpperCase()}</div>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>also in your planner</span>
                </div>
                {due.length ? (
                  <div className="muse-tasks">{due.map((t) => <TaskRow key={t.id} t={t} />)}</div>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 8, lineHeight: 1.5 }}>
                    {tasks.length ? (upcoming.length ? `Nothing due today. Next up: "${upcoming[0].title}" (${dayLabel(upcoming[0].date, today)}). Get ahead if you have time.` : 'Roadmap finished 🎉 Check Readiness, then schedule the next stage.') : 'No roadmap yet. Let me schedule your current stage below — each step lands in your planner on its day, with how to do it.'}
                  </div>
                )}
              </section>

              {/* ── ROADMAP ── */}
              <section ref={roadmapRef} className="card muse-card" style={{ '--stage': stage.color, scrollMarginTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div className="muse-label">🗺️ {roadmap ? `ROADMAP · ${String(roadmap.stage_label || '').toUpperCase()}` : 'ROADMAP'}</div>
                  {tasks.length > 0 && <div className="font-num" style={{ fontSize: 12, color: 'var(--text-3)' }}>{tasksDone}/{tasks.length}</div>}
                </div>
                {tasks.length > 0 && (
                  <>
                    <div className="muse-bar"><div style={{ width: `${Math.round((tasksDone / tasks.length) * 100)}%` }} /></div>
                    {(showAllTasks ? tasks : upcoming.slice(0, 3)).length > 0 && (
                      <div className="muse-tasks">
                        {(showAllTasks ? tasks : upcoming.slice(0, 3)).map((t) => <TaskRow key={t.id} t={t} compact />)}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
                      <button className="muse-link" onClick={() => setShowAllTasks((v) => !v)}>{showAllTasks ? 'Show less' : `See all ${tasks.length} steps`}</button>
                      {!schedOpen && <button className="muse-link" onClick={() => openScheduler(stage.id)}>↻ Re-plan</button>}
                    </div>
                  </>
                )}

                {(schedOpen || !tasks.length) && (
                  <div className="muse-sched">
                    {!tasks.length && <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12, lineHeight: 1.5 }}>Muse turns the <b style={{ color: 'var(--text)' }}>{schedSt.label}</b> playbook into dated steps for {startup.name}. They show up in your planner on the right day with how to do each one.</div>}
                    <label className="muse-label" style={{ display: 'block' }}>STAGE</label>
                    <select className="input" style={{ marginTop: 6 }} value={schedSt.id} onChange={(e) => setSchedStage(e.target.value)}>
                      {STAGES.map((s) => <option key={s.id} value={s.id}>{s.emoji} {s.label}{s.id === stage.id ? ' (current)' : ''}</option>)}
                    </select>
                    <label className="muse-label" style={{ display: 'block', marginTop: 12 }}>TIME A DAY</label>
                    <div className="muse-suggest" style={{ marginTop: 6 }}>
                      {[1, 2, 3, 4].map((h) => (
                        <button key={h} type="button" onClick={() => setSchedHours(h)} style={(schedHours || hoursDefault) === h ? { borderColor: '#7B61FF', background: 'rgba(123,97,255,0.15)' } : undefined}>{h}h</button>
                      ))}
                    </div>
                    <label className="muse-label" style={{ display: 'block', marginTop: 12 }}>START</label>
                    <input className="input" type="date" style={{ marginTop: 6 }} value={schedStart || today} min={today} onChange={(e) => setSchedStart(e.target.value)} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                      <button className="btn-primary muse-send" style={{ flex: 1 }} onClick={makeRoadmap} disabled={schedBusy}>{schedBusy ? 'Planning your days…' : `🗓️ Schedule ${schedSt.label}`}</button>
                      {tasks.length > 0 && <button className="btn-ghost" style={{ width: 'auto', padding: '0 14px' }} onClick={() => setSchedOpen(false)}>Cancel</button>}
                    </div>
                  </div>
                )}
                {schedNote && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8 }}>{schedNote}</div>}
              </section>

              {/* ── ASK MUSE ── */}
              <section ref={chatRef} className="card muse-card" style={{ scrollMarginTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div className="muse-label">💬 ASK MUSE</div>
                  {chat.length > 0 && <button className="muse-link" style={{ fontSize: 11.5, marginTop: 0 }} onClick={() => { if (window.confirm('Clear this conversation?')) save({ chat: [] }); }}>Clear</button>}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>Coaches from the founder playbook, your journey and your notebook.</div>
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
                    <input ref={focusRef} className="input" placeholder={upcoming[0] ? `e.g. ${upcoming[0].title}` : 'e.g. Interview 5 potential users'} value={focusDraft} onChange={(e) => setFocusDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setFocus()} />
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

              {/* ── QUICK ROUTES ── */}
              <section className="card muse-card">
                <div className="muse-label">🧰 FOUNDER TOOLKIT</div>
                <div className="muse-tools">
                  <button type="button" onClick={() => { setPlaybookStage(stage.id); goTab('playbook'); }}><span>🧭</span><b>{stage.label} playbook</b><small>Steps, checklist, guides</small></button>
                  <button type="button" onClick={() => goTab('pitch')}><span>🎤</span><b>Pitch + judges</b><small>{startup.pitch?.judged?.[0] ? `Last score ${startup.pitch.judged[0].overall}` : 'Draft & get scored'}</small></button>
                  <button type="button" onClick={() => goTab('investors')}><span>💼</span><b>Investor room</b><small>{(startup.investor_sessions || []).length ? `${startup.investor_sessions.length} meeting${startup.investor_sessions.length === 1 ? '' : 's'}` : 'Practise the meeting'}</small></button>
                  <button type="button" onClick={() => goTab('readiness')}><span>🧪</span><b>Readiness test</b><small>{startup.audit ? `${startup.audit.score}/100 · ${startup.audit.level}` : 'PMF & investor-ready?'}</small></button>
                </div>
              </section>

              <div className="muse-nudge" style={{ '--stage': stage.color }}>
                <span style={{ fontSize: 18 }}>💡</span>
                <span>{nudge}</span>
              </div>
            </div>
          </div>
        )}

        {tab === 'playbook' && (
          <PlaybookTab startup={startup} currentStage={stage} focusStage={playbookStage} save={save} onSchedule={openScheduler} onAsk={ask} />
        )}
        {tab === 'customers' && <CustomersTab startup={startup} save={save} />}
        {tab === 'pitch' && <PitchTab startup={startup} stages={draft} save={save} onPractice={() => goTab('investors')} />}
        {tab === 'investors' && <InvestorTab startup={startup} stages={draft} save={save} />}
        {tab === 'readiness' && (
          <ReadinessTab startup={startup} stages={draft} currentStage={stage} save={save}
            onOpenPlaybook={(sid) => { setPlaybookStage(sid); goTab('playbook'); }} onAddTask={addTask} />
        )}
        {tab === 'notebook' && <NotebookTab startup={startup} save={save} onAsk={ask} />}

        {tab === 'journey' && (
          <>
            <div style={{ padding: '16px 20px 0' }}>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 12, lineHeight: 1.5 }}>Your answers for every stage. Muse uses them for coaching, your roadmap, pitch and investor meetings.</div>
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
                            <div key={idx} style={{ padding: 10, background: 'var(--bg-2)', borderRadius: 10, borderLeft: '1px solid var(--blue)' }}>
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
          </>
        )}
        <div style={{ height: 24 }} />
      </div>
    </Layout>
  );
}
