import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import { useApp } from '../../context/AppContext';
import { genId, todayISO, deviceTzCode, tzFromText, hackDeadlineISO, hackDeadlineLabel, tzOffsetFor } from '../../lib/utils';
import TimezoneSelect from '../../components/TimezoneSelect';
import { fireConfetti } from '../../lib/confetti';
import { ScoreBar, scoreColor } from '../../components/startup/museApi';
import AppConnect from '../../components/hackcoach/AppConnect';
import PitchCoach from '../../components/hackcoach/PitchCoach';
import TeamChannel from '../../components/hackcoach/TeamChannel';
import PostMortem from '../../components/hackcoach/PostMortem';
import { startDateOf, gatherEvidence, timelineOf, timelineText, scanRepo, applyFacts, dropDone, verifiedFacts, fmtDuration } from '../../lib/hack-coach';
import { PHASES, phaseOf, mentorNotice, hoursLeft, fmtHours, workload, minutesLogged, coachTasks, submissionFields, hackForAI, coachAsk, addDays, setLessons, lessonsFrom, combinePanel } from '../../lib/hack-coach';

// The Hackathon Coach: a mentor that reads the hackathon you paste,
// researches it, helps you pick an idea, plans the build to fit the time
// left (protecting the ambitious core), judges the project the way this hackathon's judges would, coaches
// the pitch, posts to the team on Telegram, drafts the submission in your own voice, and learns from results.

const TABS = [
  ['mentor', '🧭 Mentor'],
  ['brief', '📋 Brief'],
  ['ideas', '💡 Ideas'],
  ['plan', '🛠️ Plan'],
  ['judges', '⚖️ Judges'],
  ['pitch', '🎤 Pitch'],
  ['submit', '📨 Submit'],
  ['results', '🏁 Results'],
];
const SUGGESTIONS = [
  "What's the boldest version of this idea?",
  'What will the judges care about most?',
  'What should I do in the next 2 hours?',
];
const VERDICT = {
  on_track: { label: 'On track', color: '#10B981', emoji: '✅' },
  overbuilding: { label: 'Overbuilding', color: '#EF4444', emoji: '✂️' },
  overthinking: { label: 'Overthinking', color: '#F59E0B', emoji: '🌀' },
  underbuilding: { label: 'Too thin', color: '#3B82F6', emoji: '➕' },
  build_it: { label: 'Build it', color: '#10B981', emoji: '🚀' },
  build_slice: { label: 'Build a slice', color: '#7B61FF', emoji: '🎯' },
  postpone: { label: 'After the must-haves', color: '#F59E0B', emoji: '⏳' },
  cut: { label: 'Cut it', color: '#EF4444', emoji: '✂️' },
};
const EFFECT = { up: ['▲', '#10B981'], same: ['•', 'var(--text-3)'], down: ['▼', '#EF4444'] };
const FIT = { fits: ['Fits your time', '#10B981'], tight: ['Tight', '#F59E0B'], too_big: ['Too big', '#EF4444'] };

function Orb({ size = 38, busy }) {
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
      <div className="font-num" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>{pct}%</div>
    </div>
  );
}

const fmtMin = (m) => (m >= 60 ? `${Math.round((m / 60) * 10) / 10}h` : `${Math.round(m)}m`);
function dayLabel(iso, today) {
  if (!iso) return 'Anytime';
  if (iso < today) return 'Overdue';
  if (iso === today) return 'Today';
  if (iso === addDays(today, 1)) return 'Tomorrow';
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
// The judges' verdict as plain text, for pasting into notes or a chat.
function verdictText(v, hackName) {
  const L = [];
  L.push(`Judges' verdict: ${hackName} (${v.date})`, `Overall: ${v.overall}/100`, v.verdict);
  if (v.prize_odds) L.push(`Prize odds: ${v.prize_odds}`);
  if (v.judges?.length) { L.push('', 'JUDGES'); v.judges.forEach((j) => L.push(`- ${j.role}: "${j.comment}"`)); }
  if (v.scores?.length) { L.push('', 'SCORES'); v.scores.forEach((x) => L.push(`- ${x.criterion}${x.weight ? ` (${x.weight}%)` : ''}: ${x.score}/10. ${x.note}`)); }
  if (v.requirements?.length) { L.push('', 'REQUIREMENTS'); v.requirements.forEach((r) => L.push(`- [${r.status === 'met' ? 'met' : r.status === 'missing' ? 'MISSING' : 'unclear'}${r.verified ? ', checked' : ''}] ${r.rule}${r.note ? `. ${r.note}` : ''}`)); }
  if (v.strengths?.length) { L.push('', 'WHAT WORKS'); v.strengths.forEach((x) => L.push(`- ${x}`)); }
  if (v.fixes?.length) { L.push('', 'FIX THESE FIRST'); v.fixes.forEach((x, i) => L.push(`${i + 1}. ${x}`)); }
  if (v.twists?.length) { L.push('', 'BEAT THEIR EXPECTATIONS'); v.twists.forEach((t) => L.push(`- ${t.idea}${t.hours ? ` (~${t.hours}h)` : ''}${t.why ? `. ${t.why}` : ''}`)); }
  if (v.questions?.length) { L.push('', 'THEY WILL ASK'); v.questions.forEach((x) => L.push(`- ${x}`)); }
  return L.join('\n');
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export default function HackathonCoach() {
  const router = useRouter();
  const { id } = router.query;
  const { hackathons, updateHackathon } = useApp();
  const hack = (hackathons || []).find((h) => h.id === id);

  const [tab, setTab] = useState('mentor');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [now, setNow] = useState(Date.now());
  // mentor
  const [chatDraft, setChatDraft] = useState('');
  const [logText, setLogText] = useState('');
  const [logMin, setLogMin] = useState(60);
  const [scopeText, setScopeText] = useState('');
  // brief
  const [raw, setRaw] = useState('');
  // ideas
  const [ownIdea, setOwnIdea] = useState('');
  const [picked, setPicked] = useState({});
  const [ambition, setAmbition] = useState('mix');
  // plan
  const [hours, setHours] = useState(null);
  const [openTask, setOpenTask] = useState(null);
  // judges / submit
  const [judgeSeen, setJudgeSeen] = useState(null);
  const [judgeStep, setJudgeStep] = useState('');
  const [showPanel, setShowPanel] = useState(false);
  const [fieldDraft, setFieldDraft] = useState({});
  const [copied, setCopied] = useState('');

  const autoBrief = useRef(false);
  const briefFn = useRef(null);
  const latest = useRef(hack);
  if (hack && latest.current?.id !== hack.id) latest.current = hack;
  useEffect(() => { if (hack) latest.current = hack; }, [hack]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);
  // Lessons from past post-mortems go with every mentor request for this hackathon.
  const pastLessons = lessonsFrom(hackathons || [], id);
  useEffect(() => { setLessons(pastLessons); }, [pastLessons.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (hack) { setRaw(hack.coach?.raw || ''); setFieldDraft(hack.coach?.submission?.fields || {}); } }, [hack?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Started from a paste in Tech Hub: read and research it straight away.
  useEffect(() => {
    if (hack?.coach?.raw && !hack.coach.brief && !autoBrief.current && briefFn.current) {
      autoBrief.current = true;
      briefFn.current(hack.coach.raw);
    }
  }, [hack?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = router.query.tab;
    if (typeof t === 'string' && TABS.some(([k]) => k === t)) setTab(t);
    else if (hack && !hack.coach?.brief && !router.query.tab) setTab('brief');
  }, [router.query.tab, hack?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!hack) {
    return (
      <Layout fab={false}>
        <div className="page" style={{ padding: '80px 20px' }}>
          <div className="empty-state"><div className="icon">🏆</div><h3>Hackathon not found</h3><p>It may have been deleted.</p></div>
          <button className="btn-primary" onClick={() => router.push('/tech-hub?tab=hackathons')}>← Back to Hackathons</button>
        </div>
      </Layout>
    );
  }

  const cur = () => latest.current || hack;
  const save = (patch) => { const next = { ...cur(), ...patch }; latest.current = next; return updateHackathon(next); };
  const saveCoach = (patch, extra = {}) => save({ ...extra, coach: { ...(cur().coach || {}), ...patch } });
  // The deadline as date + time + timezone (older records only have `deadline`).
  const deadlineParts = (h) => {
    if (!h) return { date: '', time: '', tz: deviceTzCode() };
    if (h.deadline_date) return { date: h.deadline_date, time: h.deadline_time || '', tz: h.deadline_tz || deviceTzCode() };
    const d = String(h.deadline || h.coach?.brief?.deadline || '');
    const tz = deviceTzCode();
    if (/T\d{2}:\d{2}/.test(d)) {
      const ms = new Date(d).getTime();
      if (Number.isFinite(ms)) { const at = new Date(ms + tzOffsetFor(tz) * 3600000).toISOString(); return { date: at.slice(0, 10), time: at.slice(11, 16), tz }; }
    }
    return { date: d.slice(0, 10), time: '', tz };
  };
  const dl = deadlineParts(hack);
  function setDeadline(patch) {
    const p = { ...deadlineParts(cur()), ...patch };
    save({ deadline_date: p.date, deadline_time: p.time, deadline_tz: p.tz, deadline: hackDeadlineISO(p.date, p.time, p.tz) });
  }

  function goTab(k) {
    setTab(k); setErr('');
    router.replace({ pathname: router.pathname, query: { ...router.query, tab: k } }, undefined, { shallow: true });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function run(kind, fn) {
    if (busy) return;
    setBusy(kind); setErr('');
    try { await fn(); } catch (e) { setErr(e.message); }
    setBusy('');
  }

  const today = todayISO();
  const coach = hack.coach || {};
  const brief = coach.brief;
  const research = coach.research;
  const phaseId = phaseOf(hack, now);
  const phaseIdx = PHASES.findIndex((p) => p.id === phaseId);
  const phase = PHASES[phaseIdx];
  const left = hoursLeft(hack, now);
  const tasks = coachTasks(hack);
  const done = tasks.filter((t) => t.done).length;
  const planPct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const w = workload(hack, now);
  const notice = mentorNotice(hack, now);
  const chat = coach.chat || [];
  const log = coach.log || [];
  const judged = coach.judged || [];
  const lastJudge = judged[0] || null;
  const fields = submissionFields(coach);
  const hoursPerDay = hours || coach.hours_per_day || 4;
  const overdue = tasks.filter((t) => !t.done && t.due && t.due < today).length;

  // ── Mentor ──
  async function ask(preset) {
    const text = String(preset ?? chatDraft).trim();
    if (!text || busy) return;
    if (tab !== 'mentor') goTab('mentor');
    const history = cur().coach?.chat || [];
    saveCoach({ chat: [...history, { id: genId(), role: 'user', text, at: Date.now() }].slice(-30) });
    setChatDraft('');
    await run('chat', async () => {
      try {
        const r = await coachAsk('hack_chat', { hack: hackForAI(cur()), question: text, history: history.slice(-8) });
        saveCoach({ chat: [...(cur().coach?.chat || []), { id: genId(), role: 'mentor', text: r.reply, at: Date.now() }].slice(-30) });
      } catch (e) { setChatDraft(text); throw e; }
    });
  }
  function addLog(text, minutes) {
    const entry = { id: genId(), date: today, at: Date.now(), text, minutes: Number(minutes) || 0 };
    saveCoach({ log: [entry, ...(cur().coach?.log || [])].slice(0, 200) });
  }
  function submitLog() {
    if (!logText.trim()) return;
    addLog(logText.trim(), logMin);
    setLogText('');
  }
  function scopeCheck() {
    run('scope', async () => {
      const r = await coachAsk('hack_scope', { hack: hackForAI(cur()), question: scopeText });
      saveCoach({ scope: { ...r, asked: scopeText, at: Date.now() } });
    });
  }
  function runNotice(action) {
    if (action === 'log') { document.getElementById('hc-log')?.focus(); return; }
    goTab(action);
  }

  // ── Brief ──
  function readBrief(text = raw) {
    if (!String(text || '').trim()) { setErr('Paste the hackathon details first: the overview, rules, tracks, prizes, judging criteria and what to submit.'); return; }
    run('brief', async () => {
      const base = cur();
      const r = await coachAsk('hack_brief', { hack: { name: base.name, organizer: base.organizer, url: base.url, coach: { raw: text } } });
      const b = r.brief;
      const fill = {};
      if (!base.name?.trim() || base.name === 'New hackathon') fill.name = b.name || base.name;
      if (!base.organizer && b.organizer) fill.organizer = b.organizer;
      if (!base.deadline && b.deadline) {
        // Keep the deadline in the hackathon's own timezone when the page says one.
        const tz = tzFromText(b.timezone) || tzFromText(text) || deviceTzCode();
        const [date, time = ''] = String(b.deadline).split('T');
        Object.assign(fill, { deadline_date: date, deadline_time: time.slice(0, 5), deadline_tz: tz, deadline: hackDeadlineISO(date, time.slice(0, 5), tz) });
      }
      if (!base.prize_pool && b.prize_total) fill.prize_pool = b.prize_total;
      if (!base.themes && b.tracks?.length) fill.themes = b.tracks.map((t) => t.name).slice(0, 4).join(', ');
      if (!base.mode && b.mode) fill.mode = b.mode;
      saveCoach({ raw: text, brief: b, research: { ...r.research, at: Date.now() } }, fill);
    });
  }
  briefFn.current = readBrief;

  // ── Ideas ──
  function getIdeas(own) {
    run(own ? 'own' : 'ideas', async () => {
      const r = await coachAsk('hack_ideas', { hack: hackForAI(cur()), own_idea: own ? ownIdea : '', ambition });
      saveCoach({ ideas: r.ideas, ideas_at: Date.now() });
      setPicked({});
    });
  }
  function chooseIdea(idea, i) {
    const twists = (idea.twists || []).filter((_, j) => picked[`${i}.${j}`]).map((t) => t.twist);
    const extra = (!cur().project_name || cur().project_name === cur().coach?.idea?.title) ? { project_name: idea.title } : {};
    saveCoach({ idea: { ...idea, twists, chosen_at: Date.now() } }, extra);
    try { fireConfetti({ count: 80 }); } catch {}
    goTab('plan');
  }

  function useAppIdea(idea) {
    const extra = !cur().project_name ? { project_name: idea.title } : {};
    saveCoach({ idea: { ...idea, chosen_at: Date.now() } }, extra);
    try { fireConfetti({ count: 80 }); } catch {}
    goTab('plan');
  }
  const appProps = { hack, cur, save, saveCoach, busy, run, onUseIdea: useAppIdea };

  // ── Plan ──
  function makePlan() {
    if (tasks.some((t) => t.done) || tasks.length) {
      if (!window.confirm('Replace the open tasks on your plan with a new plan? Finished tasks stay.')) return;
    }
    run('plan', async () => {
      const r = await coachAsk('hack_plan', { hack: hackForAI(cur()), hours_per_day: hoursPerDay });
      const base = cur();
      const keep = (base.tasks || []).filter((t) => !t.coach || t.done);
      const fresh = r.tasks.map((t) => ({ id: genId(), done: false, coach: true, ...t }));
      saveCoach({ hours_per_day: hoursPerDay, plan: { cut: r.cut, must_haves: r.must_haves, note: r.note, at: Date.now() } }, { tasks: [...keep, ...fresh] });
    });
  }
  function patchTask(tid, patch) {
    save({ tasks: (cur().tasks || []).map((t) => (t.id === tid ? { ...t, ...patch } : t)) });
  }
  function toggleTask(t) {
    const nowDone = !t.done;
    const nextTasks = (cur().tasks || []).map((x) => (x.id === t.id ? { ...x, done: nowDone, done_at: nowDone ? Date.now() : null } : x));
    const patch = { tasks: nextTasks };
    if (nowDone) {
      const entry = { id: genId(), date: today, at: Date.now(), text: `☑️ ${t.text}`, minutes: Number(t.minutes) || 0 };
      patch.coach = { ...(cur().coach || {}), log: [entry, ...(cur().coach?.log || [])].slice(0, 200) };
      if (nextTasks.filter((x) => x.coach).every((x) => x.done)) { try { fireConfetti({ count: 160 }); } catch {} }
    }
    save(patch);
  }
  function addPlanTask(text, minutes = 60) {
    save({ tasks: [...(cur().tasks || []), { id: genId(), text, done: false, coach: true, due: today, minutes, how: [], phase: 'polish' }] });
  }

  // ── Judges ──
  // Each judge is its own agent: the panel is researched once (and kept), then every judge reviews the
  // project alone, one request each, and the verdicts are combined in code.
  const askJudge = async (type, payload) => {
    try { return await coachAsk(type, payload); } catch (e) {
      if (e.status !== 429) throw e;
      // Free AI tier: pause and try this judge once more rather than failing the whole panel.
      for (let s = 20; s > 0; s--) { setJudgeStep(`Rate limited by the free AI tier, retrying in ${s}s…`); await new Promise((r) => setTimeout(r, 1000)); }
      return coachAsk(type, payload);
    }
  };
  function judgeNow(rebuild = false) {
    run('judge', async () => {
      try {
        const subm = Object.entries(cur().coach?.submission?.fields || {}).filter(([, v]) => String(v || '').trim()).map(([k, v]) => `${k}: ${v}`).join('\n');
        // Rescan first, so the judges see the repo as it is now, not as it was when it was connected.
        const app = cur().coach?.app;
        if (app?.repo?.full_name) {
          setJudgeStep('Reading your latest code…');
          try {
            const fresh = await scanRepo(app.repo.full_name, { folder: app.repo.folder || '' });
            saveCoach({ app: { ...app, repo: fresh } });
          } catch { /* rate limited or offline: judge the last scan */ }
        }
        let panel = cur().coach?.panel;
        if (rebuild || !panel?.judges?.length) {
          setJudgeStep('Assembling the judging panel (researching the sponsors and judges)…');
          panel = { ...(await askJudge('hack_panel', { hack: hackForAI(cur()) })).panel, at: Date.now() };
          saveCoach({ panel });
        }
        const sources = await gatherEvidence(cur().coach?.app?.repo);
        setJudgeSeen(sources.map((f) => f.path));
        const payload = { hack: hackForAI(cur(), { evidence: sources }), pitch: subm };
        const results = [];
        for (const [i, j] of panel.judges.entries()) {
          setJudgeStep(`Judge ${i + 1} of ${panel.judges.length}: ${j.title}${j.org ? ` (${j.org})` : ''} is reviewing…`);
          try { results.push((await askJudge('hack_judge_one', { ...payload, judge: j })).result); } catch (e) { if (!results.length && i === panel.judges.length - 1) throw e; }
        }
        if (!results.length) throw new Error('No judge could score it right now. Try again in a minute.');
        const raw = combinePanel(panel, results);
        // Checked facts beat the AI: requirements are re-marked from GitHub, done things are not suggested again.
        const r = {
          ...raw,
          requirements: applyFacts(raw.requirements, cur()),
          fixes: dropDone(raw.fixes, cur()),
          questions: dropDone(raw.questions, cur()),
          twists: dropDone(raw.twists, cur(), 'idea'),
          missing_judges: panel.judges.length - results.length,
        };
        saveCoach({ judged: [{ ...r, at: Date.now(), date: today }, ...(cur().coach?.judged || [])].slice(0, 6) });
        setTimeout(() => document.getElementById('hc-verdict')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
      } finally { setJudgeStep(''); }
    });
  }

  // ── Submit ──
  function persistFields(next) {
    saveCoach({ submission: { ...(cur().coach?.submission || {}), fields: next, updated: Date.now() } });
  }
  function draftFields(only) {
    const want = only ? fields.filter((f) => f.key === only) : fields;
    if (!only && Object.values(fieldDraft).some((v) => String(v || '').trim()) && !window.confirm('Rewrite every field? Your edits will be replaced.')) return;
    run(only ? `field:${only}` : 'submit', async () => {
      const r = await coachAsk('hack_submission', { hack: hackForAI(cur()), fields: want, extra: coach.notes || '' });
      const next = { ...(cur().coach?.submission?.fields || {}), ...r.fields };
      setFieldDraft(next);
      persistFields(next);
    });
  }
  function markSubmitted() {
    saveCoach({ submission: { ...(cur().coach?.submission || {}), fields: fieldDraft, submitted_at: Date.now() } }, { status: 'submitted', submitted: true });
    try { fireConfetti({ count: 200 }); } catch {}
  }
  const reqChecks = coach.req_checks || {};

  function TaskRow({ t }) {
    const label = dayLabel(t.due, today);
    const open = openTask === t.id;
    return (
      <div className={`muse-rtask${t.done ? ' done' : ''}`} style={{ '--stage': phase.color }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <button type="button" className="muse-check muse-check-btn" onClick={() => toggleTask(t)} aria-label={t.done ? 'Mark not done' : 'Mark done'}>{t.done ? '✓' : ''}</button>
          <button type="button" onClick={() => setOpenTask(open ? null : t.id)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', color: 'inherit', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
            <span className="muse-task-text">{t.text}</span>
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              <span className={`muse-when${label === 'Overdue' && !t.done ? ' late' : label === 'Today' ? ' now' : ''}`}>{label}</span>
              {t.minutes ? <span className="muse-when">⏱ {fmtMin(t.minutes)}</span> : null}
              {t.phase ? <span className="muse-when">{t.phase}</span> : null}
            </span>
          </button>
        </div>
        {open && (
          <div style={{ marginLeft: 36 }}>
            {t.how?.length > 0 && <ol className="muse-how">{t.how.map((h, i) => <li key={i}>{h}</li>)}</ol>}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {!t.done && <button className="muse-link" onClick={() => patchTask(t.id, { due: addDays(t.due && t.due > today ? t.due : today, 1) })}>Move to {t.due && t.due > today ? 'next day' : 'tomorrow'}</button>}
              <button className="muse-link" style={{ color: 'var(--text-2)' }} onClick={() => ask(`Help me do this task fast: "${t.text}". Steps I have: ${(t.how || []).join(' / ')}`)}>Help</button>
              <button className="muse-link" style={{ color: 'var(--red)' }} onClick={() => save({ tasks: (cur().tasks || []).filter((x) => x.id !== t.id) })}>Cut it</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const ErrLine = () => (err ? <div role="alert" style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 10, lineHeight: 1.5 }}>{err}</div> : null);

  return (
    <Layout fab={false}>
      <div className="page muse-page">
        <div className="page-top" style={{ padding: '52px 20px 0' }}>
          <button onClick={() => router.push('/tech-hub?tab=hackathons')} className="muse-back">← Hackathons</button>

          <div className="muse-hero" style={{ '--stage': phase.color }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className="muse-hero-icon">{phase.emoji}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="muse-title">{hack.name || 'New hackathon'}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  <span className="muse-chip" style={{ '--c': phase.color }}>{phase.label} · {phaseIdx + 1}/{PHASES.length}</span>
                  <span className="muse-chip muse-chip-plain" style={left != null && left < 24 && left > 0 ? { color: 'var(--red)', borderColor: 'rgba(239,68,68,0.4)' } : undefined}>⏱ {fmtHours(left)}</span>
                  {minutesLogged(coach) > 0 && <span className="muse-chip muse-chip-plain">🕒 {fmtMin(minutesLogged(coach))} logged</span>}
                  {lastJudge && <span className="muse-chip" style={{ '--c': scoreColor(lastJudge.overall) }}>⚖️ {lastJudge.overall}</span>}
                </div>
              </div>
              <Ring pct={planPct} color={phase.color} />
            </div>
            <div className="muse-path" aria-label="Hackathon phases">
              {PHASES.map((p, i) => {
                const state = i < phaseIdx ? 'done' : i === phaseIdx ? 'now' : 'todo';
                const target = { brief: 'brief', ideate: 'ideas', build: 'plan', polish: 'judges', submit: 'submit' }[p.id];
                return (
                  <button key={p.id} type="button" className={`muse-step muse-step-${state}`} style={{ '--c': p.color }} onClick={() => goTab(target)} title={p.label}>
                    <span>{state === 'done' ? '✓' : p.emoji}</span>
                  </button>
                );
              })}
            </div>
            <div className="muse-path-label">{phase.blurb}</div>
            {coach.idea && (
              <div className="muse-northstar">
                <div className="muse-label">🎯 BUILDING</div>
                <button type="button" className="muse-mission" onClick={() => goTab('ideas')}>“{coach.idea.title}: {coach.idea.pitch}”</button>
              </div>
            )}
          </div>
        </div>

        <div className="muse-tabs" role="tablist">
          {TABS.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => goTab(k)}>
              {label}
              {k === 'plan' && overdue > 0 && <span className="muse-badge">{overdue}</span>}
            </button>
          ))}
        </div>

        {/* ── MENTOR ── */}
        {tab === 'mentor' && (
          <div className="muse-grid"><div className="muse-col">
            <section className="muse-agent" style={{ '--stage': phase.color }}>
              <div className="muse-agent-head">
                <Orb busy={!!busy} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>Your mentor</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Researched {hack.name || 'this hackathon'} and watches your clock</div>
                </div>
                <span className="muse-status"><i />{busy ? 'Thinking…' : phase.label}</span>
              </div>
              {notice && (
                <div className={`muse-bubble muse-notice muse-tone-${notice.tone}`}>
                  <div className="muse-bubble-kicker">{notice.tone === 'warn' ? 'CHECKING IN' : notice.tone === 'win' ? 'NICE WORK' : 'NEXT STEP'}</div>
                  <div>{notice.text}</div>
                  <button type="button" className="muse-link" onClick={() => runNotice(notice.action)}>
                    {{ brief: 'Paste the brief →', ideas: 'Go to ideas →', plan: 'Open the plan →', judges: 'Get judged →', submit: 'Open submission →', log: 'Log progress →' }[notice.action] || 'Go →'}
                  </button>
                </div>
              )}
              {tasks.length > 0 && w.availH != null && (
                <div className="muse-bubble">
                  <div className="muse-bubble-kicker">WORK LEFT VS TIME LEFT</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>{Math.round(w.needH * 10) / 10}h of tasks</span><span>{Math.round(w.availH * 10) / 10}h you can work</span>
                  </div>
                  <ScoreBar value={Math.min(100, (w.ratio || 0) * 100)} max={100} color={w.ratio > 1.15 ? '#EF4444' : w.ratio > 0.85 ? '#F59E0B' : '#10B981'} />
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>At {coach.hours_per_day || 4}h a day. {w.ratio > 1.15 ? 'This does not fit. Cut scope.' : w.ratio > 0.85 ? 'Tight. No new features.' : 'You have buffer. Protect it.'}</div>
                </div>
              )}
            </section>

            {coach.app && <AppConnect {...appProps} compact />}

            <section className="card muse-card">
              <div className="muse-label">✍️ LOG PROGRESS</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>What did you just get done? The mentor tracks your hours against the deadline.</div>
              <textarea id="hc-log" className="input" rows={2} style={{ marginTop: 10, resize: 'vertical', lineHeight: 1.5 }} placeholder="e.g. Got the payment webhook working end to end" value={logText} onChange={(e) => setLogText(e.target.value)} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="muse-suggest" style={{ marginTop: 0, flex: 1 }}>
                  {[30, 60, 120, 240].map((m) => <button key={m} type="button" onClick={() => setLogMin(m)} style={logMin === m ? { borderColor: '#7B61FF', background: 'rgba(123,97,255,0.15)' } : undefined}>{fmtMin(m)}</button>)}
                </div>
                <button className="btn-primary muse-send" style={{ width: 'auto', padding: '0 16px' }} disabled={!logText.trim()} onClick={submitLog}>Log it</button>
              </div>
              {log.length > 0 && (
                <ul className="muse-how" style={{ listStyle: 'none', paddingLeft: 0 }}>
                  {log.slice(0, 5).map((l) => <li key={l.id}><span className="font-num" style={{ color: 'var(--text-3)' }}>{l.date}</span> · {l.text}{l.minutes ? ` (${fmtMin(l.minutes)})` : ''}</li>)}
                </ul>
              )}
            </section>

            <section className="card muse-card">
              <div className="muse-label">🧭 VISION CHECK</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>Thinking of adding something big, or changing direction? The mentor researches what already exists, finds the wild version and the slice you can really demo, then works out how to fit it in.</div>
              <textarea className="input" rows={2} style={{ marginTop: 10, resize: 'vertical', lineHeight: 1.5 }} placeholder="e.g. Add a live AR mirror that shows the outfit on the user" value={scopeText} onChange={(e) => setScopeText(e.target.value)} />
              <button className="btn-primary muse-send" style={{ marginTop: 8 }} onClick={scopeCheck} disabled={!!busy || !coach.brief}>{busy === 'scope' ? 'Researching & thinking (≈30s)…' : 'Check the vision'}</button>
              {coach.scope && (() => {
                const v = VERDICT[coach.scope.verdict] || VERDICT.on_track;
                return (
                  <div className="muse-bubble" style={{ marginTop: 12, borderLeft: `3px solid ${v.color}` }}>
                    <div className="muse-bubble-kicker" style={{ color: v.color }}>{v.emoji} {v.label.toUpperCase()}</div>
                    <div style={{ fontWeight: 700 }}>{coach.scope.headline}</div>
                    {coach.scope.win_effect && <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4 }}>{coach.scope.win_effect}</div>}
                    {coach.scope.what_exists?.length > 0 && <>
                      <div className="muse-label" style={{ marginTop: 10 }}>WHAT ALREADY EXISTS</div>
                      <ul className="muse-how">{coach.scope.what_exists.map((x) => <li key={x.name}>{x.url ? <a href={x.url} target="_blank" rel="noreferrer" style={{ color: 'inherit', fontWeight: 600 }}>{x.name}</a> : <b>{x.name}</b>}: {x.does}</li>)}</ul>
                    </>}
                    {coach.scope.gap && <><div className="muse-label" style={{ marginTop: 6 }}>THE GAP</div><div style={{ fontSize: 13, lineHeight: 1.5 }}>{coach.scope.gap}</div></>}
                    {coach.scope.wild_version && <><div className="muse-label" style={{ marginTop: 10, color: '#E64FB4' }}>🔥 WILD VERSION</div><div style={{ fontSize: 13, lineHeight: 1.5 }}>{coach.scope.wild_version}</div></>}
                    {coach.scope.demo_slice?.what && <>
                      <div className="muse-label" style={{ marginTop: 10, color: '#7B61FF' }}>🎯 SLICE TO DEMO{coach.scope.demo_slice.hours ? ` · ~${coach.scope.demo_slice.hours}h` : ''}</div>
                      <div style={{ fontSize: 13, lineHeight: 1.5 }}>{coach.scope.demo_slice.what}</div>
                      {coach.scope.demo_slice.how?.length > 0 && <ol className="muse-how">{coach.scope.demo_slice.how.map((x) => <li key={x}>{x}</li>)}</ol>}
                    </>}
                    {coach.scope.judge_view?.length > 0 && <>
                      <div className="muse-label" style={{ marginTop: 8 }}>WHAT THE JUDGES WOULD SEE</div>
                      <div style={{ display: 'grid', gap: 4, marginTop: 4 }}>{coach.scope.judge_view.map((j) => { const [ic, col] = EFFECT[j.effect] || EFFECT.same; return <div key={j.criterion} style={{ fontSize: 12.5, lineHeight: 1.45 }}><b style={{ color: col }}>{ic} {j.criterion}</b>: {j.why}</div>; })}</div>
                    </>}
                    {coach.scope.time_check && <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 10 }}>⏱ {coach.scope.time_check}</div>}
                    {coach.scope.make_time?.length > 0 && <><div className="muse-label" style={{ marginTop: 10, color: '#F59E0B' }}>MAKE TIME BY TRIMMING</div><ul className="muse-how">{coach.scope.make_time.map((x) => <li key={x}>{x}</li>)}</ul></>}
                    {coach.scope.cut?.length > 0 && <><div className="muse-label" style={{ marginTop: 10, color: 'var(--red)' }}>CUT</div><ul className="muse-how">{coach.scope.cut.map((x) => <li key={x}>{x}</li>)}</ul></>}
                    {coach.scope.keep?.length > 0 && <><div className="muse-label" style={{ marginTop: 6, color: 'var(--green)' }}>KEEP</div><ul className="muse-how">{coach.scope.keep.map((x) => <li key={x}>{x}</li>)}</ul></>}
                    {coach.scope.do_next?.length > 0 && <><div className="muse-label" style={{ marginTop: 6 }}>DO NEXT</div><ol className="muse-how">{coach.scope.do_next.map((x) => <li key={x}>{x}</li>)}</ol></>}
                  </div>
                );
              })()}
            </section>

            <section className="card muse-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="muse-label">💬 ASK YOUR MENTOR</div>
                {chat.length > 0 && <button className="muse-link" style={{ fontSize: 11.5, marginTop: 0 }} onClick={() => { if (window.confirm('Clear this conversation?')) saveCoach({ chat: [] }); }}>Clear</button>}
              </div>
              {chat.length > 0 || busy === 'chat' ? (
                <div className="muse-chat">
                  {chat.map((m) => (
                    <div key={m.id} className={`muse-msg ${m.role === 'user' ? 'me' : 'them'}`}>
                      {m.role !== 'user' && <Orb size={22} />}
                      <div className="muse-msg-body">{m.text}</div>
                    </div>
                  ))}
                  {busy === 'chat' && <div className="muse-msg them"><Orb size={22} busy /><div className="muse-msg-body muse-typing"><i /><i /><i /></div></div>}
                </div>
              ) : (
                <div className="muse-suggest">{SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => ask(s)} disabled={!coach.brief}>{s}</button>)}</div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <input className="input" style={{ flex: 1 }} placeholder={coach.brief ? 'Ask anything about this hackathon…' : 'Paste the brief first'} value={chatDraft} onChange={(e) => setChatDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask()} disabled={!coach.brief} />
                <button className="btn-primary muse-send" style={{ width: 'auto', padding: '0 16px' }} onClick={() => ask()} disabled={!chatDraft.trim() || !!busy}>↑</button>
              </div>
              <ErrLine />
            </section>
          </div></div>
        )}

        {/* ── BRIEF ── */}
        {tab === 'brief' && (
          <div className="muse-grid"><div className="muse-col">
            <section className="card muse-card">
              <label className="muse-label" htmlFor="hc-raw">📋 PASTE THE HACKATHON DETAILS</label>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '8px 0 10px', lineHeight: 1.5 }}>Copy everything from the hackathon page: overview, rules, tracks, prizes, judging criteria, submission requirements and dates. The mentor reads it, searches the web for more about this hackathon, and tells you what wins it.</div>
              <textarea id="hc-raw" className="input" rows={8} style={{ resize: 'vertical', lineHeight: 1.5, fontSize: 13 }} placeholder="Paste the Devpost / Devfolio / organizer page here…" value={raw} onChange={(e) => setRaw(e.target.value)} />
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{raw.length.toLocaleString()} characters{raw.length > 12000 ? ' · only the first 12,000 are read' : ''}</div>
              <button className="btn-primary muse-send" style={{ marginTop: 10 }} onClick={() => readBrief()} disabled={!!busy}>{busy === 'brief' ? 'Reading and researching… (up to a minute)' : brief ? '🔎 Re-read and research again' : '🔎 Read and research this hackathon'}</button>
              <ErrLine />
            </section>

            {brief && (
              <>
                <section className="card muse-card">
                  <div className="muse-label">🏁 THE HACKATHON</div>
                  <div style={{ fontSize: 15, fontWeight: 800, marginTop: 6 }}>{brief.name || hack.name}</div>
                  {brief.organizer && <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>by {brief.organizer}{brief.mode ? ` · ${brief.mode}` : ''}</div>}
                  {brief.summary && <div style={{ fontSize: 13.5, lineHeight: 1.55, marginTop: 8 }}>{brief.summary}</div>}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                    <label style={{ flex: '1 1 140px', fontSize: 11.5, fontWeight: 700, color: 'var(--text-2)' }}>OPENED
                      <input type="date" className="input" style={{ marginTop: 4 }} value={startDateOf(hack)} onChange={(e) => saveCoach({ start_date: e.target.value })} />
                    </label>
                    <label style={{ flex: '1 1 140px', fontSize: 11.5, fontWeight: 700, color: 'var(--text-2)' }}>DEADLINE
                      <input type="date" className="input" style={{ marginTop: 4 }} value={dl.date} onChange={(e) => setDeadline({ date: e.target.value })} />
                    </label>
                    <label style={{ flex: '0 1 120px', fontSize: 11.5, fontWeight: 700, color: 'var(--text-2)' }}>TIME
                      <input type="time" className="input" style={{ marginTop: 4 }} value={dl.time} onChange={(e) => setDeadline({ time: e.target.value })} />
                    </label>
                  </div>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text-2)', marginTop: 10 }}>DEADLINE TIMEZONE (as the page shows it)
                    <TimezoneSelect style={{ marginTop: 4 }} value={dl.tz} onChange={(v) => setDeadline({ tz: v })} />
                  </label>
                  {dl.date && dl.time && <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 700, marginTop: 6 }}>🇰🇪 {hackDeadlineLabel({ deadline: 'x', deadline_date: dl.date, deadline_time: dl.time, deadline_tz: dl.tz })}</div>}
                  {!startDateOf(hack) && <div style={{ fontSize: 11.5, color: 'var(--yellow)', marginTop: 6 }}>The details don't say when it opened. Add the date so the coach can tell whether your app was built during the hackathon.</div>}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                    {brief.timezone && <span className="muse-chip muse-chip-plain">🕒 {brief.timezone}</span>}
                    {brief.prize_total && <span className="muse-chip" style={{ '--c': '#10B981' }}>🏆 {brief.prize_total}</span>}
                  </div>
                  {brief.key_dates?.length > 0 && <ul className="muse-how">{brief.key_dates.map((d) => <li key={d}>{d}</li>)}</ul>}
                </section>

                {brief.criteria?.length > 0 && (
                  <section className="card muse-card">
                    <div className="muse-label">⚖️ HOW YOU'RE JUDGED</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                      {brief.criteria.map((k) => (
                        <div key={k.name}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><b>{k.name}</b>{k.weight ? <span className="font-num">{k.weight}%</span> : null}</div>
                          {k.weight ? <ScoreBar value={k.weight} max={Math.max(...brief.criteria.map((x) => x.weight || 0), 1)} /> : null}
                          {k.description && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3 }}>{k.description}</div>}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {brief.tracks?.length > 0 && (
                  <section className="card muse-card">
                    <div className="muse-label">🎯 TRACKS & PRIZES</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                      {brief.tracks.map((t) => (
                        <div key={t.name} style={{ padding: 12, borderRadius: 12, background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b style={{ fontSize: 13.5 }}>{t.name}</b>{t.prize && <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 700 }}>{t.prize}</span>}</div>
                          {t.description && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.5 }}>{t.description}</div>}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {(brief.requirements?.length > 0 || brief.sponsor_tech?.length > 0) && (
                  <section className="card muse-card">
                    {brief.requirements?.length > 0 && <><div className="muse-label" style={{ color: 'var(--yellow)' }}>📏 HARD REQUIREMENTS</div><ul className="muse-how">{brief.requirements.map((r) => <li key={r}>{r}</li>)}</ul></>}
                    {brief.sponsor_tech?.length > 0 && <><div className="muse-label" style={{ marginTop: 10 }}>🧩 SPONSOR TOOLS</div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>{brief.sponsor_tech.map((s) => <span key={s} className="muse-chip muse-chip-plain">{s}</span>)}</div></>}
                    {brief.unclear?.length > 0 && <><div className="muse-label" style={{ marginTop: 12 }}>❓ CHECK WITH THE ORGANIZERS</div><ul className="muse-how">{brief.unclear.map((r) => <li key={r}>{r}</li>)}</ul></>}
                  </section>
                )}

                {research && (
                  <section className="card muse-card muse-agent" style={{ '--stage': '#7B61FF' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <div className="muse-label">🔬 MENTOR'S RESEARCH</div>
                      <span className="muse-chip muse-chip-plain">{research.searched ? `Web-checked · ${research.confidence}` : 'From the brief only'}</span>
                    </div>
                    {research.insights?.length > 0 && <ul className="muse-how">{research.insights.map((x) => <li key={x}>{x}</li>)}</ul>}
                    {research.winning_pattern && <><div className="muse-label" style={{ marginTop: 10, color: 'var(--green)' }}>WHAT WINNERS HAD</div><div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 6, lineHeight: 1.5 }}>{research.winning_pattern}</div></>}
                    {research.sponsor_angles?.length > 0 && <><div className="muse-label" style={{ marginTop: 10 }}>SPONSOR PRIZE ANGLES</div><ul className="muse-how">{research.sponsor_angles.map((x) => <li key={x}>{x}</li>)}</ul></>}
                    {research.pitfalls?.length > 0 && <><div className="muse-label" style={{ marginTop: 10, color: 'var(--red)' }}>HOW ENTRIES LOSE HERE</div><ul className="muse-how">{research.pitfalls.map((x) => <li key={x}>{x}</li>)}</ul></>}
                    {research.sources?.length > 0 && (
                      <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--text-3)', overflowWrap: 'anywhere' }}>
                        Sources: {research.sources.map((u, i) => <span key={u}>{i > 0 && ' · '}<a href={u} target="_blank" rel="noreferrer" style={{ color: '#A78BFA' }}>{u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}</a></span>)}
                      </div>
                    )}
                    <button className="muse-link" onClick={() => goTab('ideas')}>Next: pick an idea →</button>
                  </section>
                )}
              </>
            )}
          </div></div>
        )}

        {/* ── IDEAS ── */}
        {tab === 'ideas' && (
          <div className="muse-grid"><div className="muse-col">
            <AppConnect {...appProps} />
            {coach.idea && (
              <section className="card muse-card" style={{ borderColor: 'rgba(16,185,129,0.4)' }}>
                <div className="muse-label" style={{ color: 'var(--green)' }}>✅ YOUR IDEA</div>
                <div style={{ fontSize: 16, fontWeight: 800, marginTop: 6 }}>{coach.idea.title}</div>
                <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5, marginTop: 4 }}>{coach.idea.pitch}</div>
                {coach.idea.features?.length > 0 && <><div className="muse-label" style={{ marginTop: 10 }}>MUST WORK IN THE DEMO</div><ul className="muse-how">{coach.idea.features.map((f) => <li key={f}>{f}</li>)}</ul></>}
                {coach.idea.twists?.length > 0 && <><div className="muse-label" style={{ marginTop: 6 }}>TWISTS YOU'RE ADDING</div><ul className="muse-how">{coach.idea.twists.map((f) => <li key={f}>{f}</li>)}</ul></>}
                <label className="muse-label" htmlFor="hc-notes" style={{ display: 'block', marginTop: 12 }}>YOUR NOTES ON THE PROJECT</label>
                <textarea id="hc-notes" className="input" rows={3} style={{ marginTop: 6, resize: 'vertical', lineHeight: 1.5 }} placeholder="Stack, what works, what broke, who you tested it with. The mentor and the submission writer use this." defaultValue={coach.notes || ''} onBlur={(e) => e.target.value !== (coach.notes || '') && saveCoach({ notes: e.target.value })} />
              </section>
            )}

            <section className="card muse-card">
              <div className="muse-label">💡 {coach.idea ? 'EXPLORE OTHER IDEAS' : coach.app ? 'OR START SOMETHING NEW' : 'FIND AN IDEA THAT WINS THIS'}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '8px 0 12px', lineHeight: 1.5 }}>The mentor researches real problems in this hackathon's space and what the host's platform can do, then pitches ideas with a demo moment they won't see coming, each scoped to a slice you can finish in time.</div>
              <div className="muse-label">HOW AMBITIOUS?</div>
              <div className="muse-suggest" style={{ marginTop: 6, marginBottom: 12 }}>
                {[['mix', '🎲 A mix'], ['bold', '🚀 Bold'], ['wild', '🤯 Wild']].map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setAmbition(k)} style={ambition === k ? { borderColor: '#7B61FF', background: 'rgba(123,97,255,0.15)' } : undefined}>{l}</button>
                ))}
              </div>
              <button className="btn-primary muse-send" onClick={() => getIdeas(false)} disabled={!!busy || !brief}>{busy === 'ideas' ? 'Researching and thinking…' : !brief ? 'Paste the brief first' : coach.ideas?.length ? '✨ New ideas' : '✨ Suggest ideas'}</button>
              <label className="muse-label" htmlFor="hc-own" style={{ display: 'block', marginTop: 16 }}>OR STRESS-TEST YOUR OWN IDEA</label>
              <textarea id="hc-own" className="input" rows={3} style={{ marginTop: 6, resize: 'vertical', lineHeight: 1.5 }} placeholder="Describe your idea: who it helps, what it does, how you'd build it" value={ownIdea} onChange={(e) => setOwnIdea(e.target.value)} />
              <button className="btn-ghost" style={{ marginTop: 8 }} onClick={() => getIdeas(true)} disabled={!!busy || !ownIdea.trim() || !brief}>{busy === 'own' ? 'Testing your idea…' : '🧪 Test my idea'}</button>
              <ErrLine />
            </section>

            {(coach.ideas || []).map((idea, i) => {
              const [fitLabel, fitColor] = FIT[idea.fit] || FIT.tight;
              return (
                <section key={`${idea.title}-${i}`} className="card muse-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 15.5, fontWeight: 800 }}>{idea.title}</div>
                    <span className="muse-chip" style={{ '--c': fitColor, flexShrink: 0 }}>{fitLabel}{idea.hours ? ` · ~${Math.round(idea.hours)}h` : ''}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2, fontSize: 11.5, fontWeight: 700 }}>
                    {idea.ambition && <span style={{ color: { safe: '#10B981', bold: '#F59E0B', wild: '#E64FB4' }[idea.ambition] }}>{{ safe: '🛡 Safe', bold: '🚀 Bold', wild: '🤯 Wild' }[idea.ambition]}</span>}
                    {idea.track && <span style={{ color: '#A78BFA' }}>🎯 {idea.track}</span>}
                  </div>
                  {idea.problem && <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 8, lineHeight: 1.5 }}><b style={{ color: 'var(--text)' }}>The problem:</b> {idea.problem}{idea.source && <> <a href={idea.source} target="_blank" rel="noreferrer" style={{ color: '#A78BFA' }}>source ↗</a></>}</div>}
                  <div style={{ fontSize: 13, lineHeight: 1.5, marginTop: 6 }}>{idea.pitch}</div>
                  {idea.wow && <div className="muse-bubble" style={{ marginTop: 8, borderLeft: '3px solid #E64FB4' }}><div className="muse-bubble-kicker" style={{ color: '#E64FB4' }}>THE MOMENT THEY WON'T EXPECT</div>{idea.wow}</div>}
                  {idea.why_wins && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 6, lineHeight: 1.5 }}><b>Why it scores:</b> {idea.why_wins}</div>}
                  {idea.features?.length > 0 && <><div className="muse-label" style={{ marginTop: 10 }}>CORE FEATURES</div><ul className="muse-how">{idea.features.map((f) => <li key={f}>{f}</li>)}</ul></>}
                  {idea.cut?.length > 0 && <><div className="muse-label" style={{ marginTop: 6, color: 'var(--red)' }}>DON'T BUILD</div><ul className="muse-how">{idea.cut.map((f) => <li key={f}>{f}</li>)}</ul></>}
                  {idea.twists?.length > 0 && (
                    <>
                      <div className="muse-label" style={{ marginTop: 6, color: 'var(--yellow)' }}>TWISTS TO BLOW THE JUDGES AWAY · TICK TO ADD</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                        {idea.twists.map((t, j) => (
                          <label key={t.twist} style={{ display: 'flex', gap: 8, fontSize: 12.5, lineHeight: 1.45, cursor: 'pointer' }}>
                            <input type="checkbox" checked={!!picked[`${i}.${j}`]} onChange={(e) => setPicked((p) => ({ ...p, [`${i}.${j}`]: e.target.checked }))} style={{ marginTop: 3 }} />
                            <span><b>{t.twist}</b>{t.hours ? ` (~${t.hours}h)` : ''}{t.why ? <span style={{ color: 'var(--text-3)' }}> · {t.why}</span> : null}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                  {idea.sponsor_use && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 8 }}>🧩 {idea.sponsor_use}</div>}
                  {idea.risk && <div style={{ fontSize: 12, color: 'var(--yellow)', marginTop: 6 }}>⚠ {idea.risk}</div>}
                  <button className="btn-primary muse-send" style={{ marginTop: 12 }} onClick={() => chooseIdea(idea, i)}>Build this one</button>
                </section>
              );
            })}
          </div></div>
        )}

        {/* ── PLAN ── */}
        {tab === 'plan' && (
          <div className="muse-grid"><div className="muse-col">
            <section className="card muse-card" style={{ '--stage': phase.color }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="muse-label">🛠️ BUILD PLAN</div>
                {tasks.length > 0 && <span className="font-num" style={{ fontSize: 12, color: 'var(--text-3)' }}>{done}/{tasks.length}</span>}
              </div>
              {tasks.length > 0 && <div className="muse-bar"><div style={{ width: `${planPct}%` }} /></div>}
              {coach.plan?.note && <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 6, lineHeight: 1.5 }}>{coach.plan.note}</div>}
              {tasks.length > 0 ? (
                <div className="muse-tasks">{[...tasks].sort((a, b) => Number(a.done) - Number(b.done) || String(a.due || '9').localeCompare(String(b.due || '9'))).map((t) => <TaskRow key={t.id} t={t} />)}</div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 8, lineHeight: 1.5 }}>{coach.idea ? `The mentor splits "${coach.idea.title}" into timed tasks that fit before the deadline, with the last stretch kept for the video, README and write-up. They also show on your hackathon card and in the planner.` : 'Pick an idea first, then the mentor plans the build.'}</div>
              )}
              <div className="muse-sched">
                <div className="muse-label">HOURS A DAY YOU CAN GIVE IT</div>
                <div className="muse-suggest" style={{ marginTop: 6 }}>
                  {[2, 4, 6, 8, 12].map((h) => <button key={h} type="button" onClick={() => setHours(h)} style={hoursPerDay === h ? { borderColor: '#7B61FF', background: 'rgba(123,97,255,0.15)' } : undefined}>{h}h</button>)}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>{left != null ? `${fmtHours(left)} → about ${Math.round(Math.max(0, (left / 24) * hoursPerDay))}h of real work.` : 'Add a deadline to the hackathon so the plan can fit it.'}</div>
                <button className="btn-primary muse-send" style={{ marginTop: 10 }} onClick={makePlan} disabled={!!busy || !coach.idea}>{busy === 'plan' ? 'Planning…' : tasks.length ? '↻ Re-plan to fit the time left' : '🗓️ Plan my build'}</button>
              </div>
              <ErrLine />
            </section>

            {(coach.plan?.must_haves?.length > 0 || coach.plan?.cut?.length > 0) && (
              <section className="card muse-card">
                {coach.plan.must_haves?.length > 0 && <><div className="muse-label" style={{ color: 'var(--green)' }}>MUST EXIST AT SUBMISSION</div><ul className="muse-how">{coach.plan.must_haves.map((x) => <li key={x}>{x}</li>)}</ul></>}
                {coach.plan.cut?.length > 0 && <><div className="muse-label" style={{ marginTop: 10, color: 'var(--red)' }}>DELIBERATELY NOT BUILDING</div><ul className="muse-how">{coach.plan.cut.map((x) => <li key={x}>{x}</li>)}</ul></>}
              </section>
            )}

            <TeamChannel hack={hack} />
          </div></div>
        )}

        {/* ── JUDGES ── */}
        {tab === 'judges' && (
          <div className="muse-grid"><div className="muse-col">
            <section className="card muse-card muse-agent" style={{ '--stage': '#7B61FF' }}>
              <div className="muse-label">⚖️ THIS HACKATHON'S PANEL</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '8px 0 10px', lineHeight: 1.5 }}>A panel shaped like this event's judges scores your project on {brief?.criteria?.length ? `its ${brief.criteria.length} criteria` : 'standard hackathon criteria'}, checks every requirement, and suggests twists that would beat their expectations.</div>
              <label className="muse-label" htmlFor="hc-pres" style={{ display: 'block' }}>YOUR PRESENTATION</label>
              <textarea id="hc-pres" className="input" rows={6} style={{ marginTop: 6, resize: 'vertical', lineHeight: 1.5 }} placeholder="Paste your demo video's script (what it says and shows), slides' text or pitch notes. Judges score what they see here." defaultValue={coach.presentation?.text || ''} onBlur={(e) => e.target.value !== (coach.presentation?.text || '') && saveCoach({ presentation: { ...(coach.presentation || {}), text: e.target.value } })} />
              <input className="input" style={{ marginTop: 8 }} aria-label="Presentation links" placeholder="Links: deck, demo video, live app (optional)" defaultValue={coach.presentation?.links || ''} onBlur={(e) => e.target.value !== (coach.presentation?.links || '') && saveCoach({ presentation: { ...(coach.presentation || {}), links: e.target.value } })} />
              <input className="input" style={{ marginTop: 8 }} aria-label="Demo video length" inputMode="numeric" placeholder="Video length, e.g. 2:47" defaultValue={coach.presentation?.video_length || ''} onBlur={(e) => e.target.value !== (coach.presentation?.video_length || '') && saveCoach({ presentation: { ...(coach.presentation || {}), video_length: e.target.value.trim() } })} />
              {(() => {
                const r = coach.app?.repo;
                const tl = r ? timelineOf(hack, r) : null;
                const filled = Object.values(coach.submission?.fields || {}).filter((v) => String(v || '').trim()).length;
                const row = (ok, text) => <li>{ok ? '✅' : '⬜'} {text}</li>;
                return (
                  <>
                    <div className="muse-label" style={{ marginTop: 14 }}>WHAT THE JUDGES WILL READ</div>
                    <ul className="muse-how" style={{ listStyle: 'none', paddingLeft: 0 }}>
                      {row(!!coach.presentation?.text?.trim(), coach.presentation?.text?.trim() ? 'Your presentation' : 'Your presentation (paste it above)')}
                      {(() => {
                        const f = verifiedFacts(hack);
                        const len = f.video_seconds != null ? fmtDuration(f.video_seconds) : '';
                        const lim = f.video_limit ? `${f.video_limit.min ? `${fmtDuration(f.video_limit.min)}–` : 'up to '}${fmtDuration(f.video_limit.max)}` : '';
                        if (f.video_ok === false) return <li>⚠️ Video {len} is outside the {lim} limit</li>;
                        if (len) return row(!!f.video, `Video ${len}${f.video_ok ? `, within ${lim}` : ''}${f.video ? '' : ' (add its link above)'}`);
                        return row(false, f.video ? 'Video link (add its length so it can be checked)' : 'Demo video (add its link and length above)');
                      })()}
                      {row(!!r, r ? `Code from ${r.full_name}${r.folder ? `/${r.folder}` : ''}: README, ${r.file_count} file names and the main source files` : 'Code (connect your app on the Ideas tab)')}
                      {row(filled > 0, filled ? `Submission draft (${filled} fields)` : 'Submission draft (none yet)')}
                      {r && <li>{tl.verdict === 'during' ? '✅' : tl.verdict === 'before' ? '⚠️' : '⬜'} {timelineText(tl) || 'Build dates'}</li>}
                    </ul>
                    {judgeSeen?.length > 0 && <div style={{ fontSize: 11.5, color: 'var(--text-3)', overflowWrap: 'anywhere' }}>Last run opened: {judgeSeen.join(', ')}</div>}
                  </>
                );
              })()}
              <button className="btn-primary muse-send" style={{ marginTop: 10 }} onClick={() => judgeNow(false)} disabled={!!busy || !coach.idea}>{busy === 'judge' ? 'The judges are reviewing…' : !coach.idea ? 'Pick an idea first' : coach.panel ? '⚖️ Judge my project' : '⚖️ Assemble the panel and judge'}</button>
              {judgeStep && <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 8 }}>⏳ {judgeStep}</div>}
              {coach.panel?.judges?.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <button type="button" className="muse-link" style={{ marginTop: 0 }} onClick={() => setShowPanel((x) => !x)}>{showPanel ? 'Hide the panel' : `👥 Meet the panel (${coach.panel.judges.length} judges)`}</button>
                    <button type="button" className="muse-link" style={{ marginTop: 0 }} disabled={!!busy} onClick={() => { if (window.confirm('Research and build a new judging panel, then judge again?')) judgeNow(true); }}>↻ Build a new panel</button>
                  </div>
                  {showPanel && coach.panel.judges.map((j) => (
                    <div key={j.key} style={{ marginTop: 10, padding: 12, borderRadius: 12, background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
                      <div className="muse-label">{j.title.toUpperCase()}{j.org ? ` · ${j.org.toUpperCase()}` : ''} <span style={{ color: 'var(--text-3)' }}>({j.seat})</span></div>
                      <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.5 }}>{j.workspace}</div>
                      {j.cares?.length > 0 && <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.5 }}><b>Looks for:</b> {j.cares.join(' · ')}</div>}
                      {j.red_flags?.length > 0 && <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.5, color: '#F59E0B' }}><b>Marks down:</b> {j.red_flags.join(' · ')}</div>}
                      {j.sponsor_lens && <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.5 }}><b>On the sponsor tech:</b> {j.sponsor_lens}</div>}
                      {j.asks_like && <div style={{ fontSize: 12, marginTop: 4, color: 'var(--text-3)', fontStyle: 'italic' }}>“{j.asks_like}”</div>}
                    </div>
                  ))}
                </div>
              )}
              <ErrLine />
            </section>

            {lastJudge && (
              <section id="hc-verdict" className="card muse-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div className="muse-score" style={{ '--c': scoreColor(lastJudge.overall) }}>{lastJudge.overall}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <div className="muse-label">VERDICT · {lastJudge.date}</div>
                      <button className="muse-link" style={{ marginTop: 0 }} onClick={async () => { if (await copy(verdictText(lastJudge, hack.name))) { setCopied('verdict'); setTimeout(() => setCopied(''), 1500); } }}>{copied === 'verdict' ? 'Copied ✓' : '📋 Copy verdict'}</button>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4, marginTop: 4 }}>{lastJudge.verdict}</div>
                    {judged[1] && <div style={{ fontSize: 11.5, color: lastJudge.overall >= judged[1].overall ? 'var(--green)' : 'var(--red)', marginTop: 4 }}>{lastJudge.overall >= judged[1].overall ? '▲' : '▼'} from {judged[1].overall} last time</div>}
                  </div>
                </div>
                {lastJudge.prize_odds && <div className="muse-bubble" style={{ marginTop: 12 }}>🏆 {lastJudge.prize_odds}</div>}
                {lastJudge.judges?.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                    {lastJudge.judges.map((j) => (
                      <div key={j.role} style={{ padding: 12, borderRadius: 12, background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <div className="muse-label">{j.role.toUpperCase()}</div>
                          {j.score != null && <span className="font-num" style={{ fontSize: 13, fontWeight: 800, color: scoreColor(j.score) }}>{j.score}{j.shortlist ? ' ⭐' : ''}</span>}
                        </div>
                        <div style={{ fontSize: 13, lineHeight: 1.5, marginTop: 4 }}>“{j.comment}”</div>
                        {j.shortlist && <div style={{ fontSize: 11.5, color: 'var(--green)', marginTop: 4 }}>Would shortlist it{j.track ? ` for ${j.track}` : ''}</div>}
                      </div>
                    ))}
                    {lastJudge.missing_judges > 0 && <div style={{ fontSize: 11.5, color: '#F59E0B' }}>{lastJudge.missing_judges} judge{lastJudge.missing_judges > 1 ? 's' : ''} could not score this run (free AI limit); the verdict uses the others.</div>}
                  </div>
                )}
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {lastJudge.scores.map((s) => (
                    <div key={s.criterion}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><b>{s.criterion}{s.weight ? <span style={{ color: 'var(--text-3)', fontWeight: 500 }}> · {s.weight}%</span> : null}</b><span className="font-num">{s.score}/10</span></div>
                      <ScoreBar value={s.score} color={scoreColor(s.score * 10)} />
                      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3 }}>{s.note}</div>
                    </div>
                  ))}
                </div>
                {lastJudge.requirements?.length > 0 && (
                  <>
                    <div className="muse-label" style={{ marginTop: 16 }}>REQUIREMENTS CHECK</div>
                    <ul className="muse-how" style={{ listStyle: 'none', paddingLeft: 0 }}>
                      {lastJudge.requirements.map((r) => <li key={r.rule}>{r.status === 'met' ? '✅' : r.status === 'missing' ? '❌' : '❔'} {r.rule}{r.verified ? <span style={{ color: 'var(--green)', fontSize: 11, fontWeight: 700 }}> · checked</span> : null}{r.note ? <span style={{ color: 'var(--text-3)' }}> · {r.note}</span> : null}</li>)}
                    </ul>
                  </>
                )}
                {lastJudge.strengths?.length > 0 && <><div className="muse-label" style={{ marginTop: 12, color: 'var(--green)' }}>WHAT WORKS</div><ul className="muse-how">{lastJudge.strengths.map((x) => <li key={x}>{x}</li>)}</ul></>}
                {lastJudge.fixes?.length > 0 && (
                  <>
                    <div className="muse-label" style={{ marginTop: 12, color: 'var(--yellow)' }}>FIX THESE FIRST</div>
                    <ol className="muse-how">{lastJudge.fixes.map((x) => <li key={x}>{x} <button className="muse-link" style={{ marginTop: 0, fontSize: 11.5 }} onClick={() => addPlanTask(x, 60)}>+ plan</button></li>)}</ol>
                  </>
                )}
                {lastJudge.twists?.length > 0 && (
                  <>
                    <div className="muse-label" style={{ marginTop: 12, color: '#E64FB4' }}>BEAT THEIR EXPECTATIONS</div>
                    <ul className="muse-how">{lastJudge.twists.map((t) => <li key={t.idea}><b>{t.idea}</b>{t.hours ? ` (~${t.hours}h)` : ''}{t.why ? <span style={{ color: 'var(--text-3)' }}> · {t.why}</span> : null} <button className="muse-link" style={{ marginTop: 0, fontSize: 11.5 }} onClick={() => addPlanTask(t.idea, Math.round((t.hours || 1) * 60))}>+ plan</button></li>)}</ul>
                  </>
                )}
                {lastJudge.questions?.length > 0 && (
                  <>
                    <div className="muse-label" style={{ marginTop: 12 }}>THEY WILL ASK YOU</div>
                    <ul className="muse-how">{lastJudge.questions.map((x) => <li key={x}>{x}</li>)}</ul>
                    <button className="muse-link" onClick={() => ask(`Help me answer the judges' questions well: ${lastJudge.questions.join(' | ')}`)}>Practise the answers with your mentor →</button>
                  </>
                )}
              </section>
            )}
          </div></div>
        )}

        {/* ── SUBMIT ── */}
        {/* ── PITCH ── */}
        {tab === 'pitch' && <PitchCoach hack={hack} saveCoach={saveCoach} />}

        {/* ── RESULTS ── */}
        {tab === 'results' && <PostMortem hack={hack} saveCoach={saveCoach} pastLessons={pastLessons} />}

        {tab === 'submit' && (
          <div className="muse-grid"><div className="muse-col">
            <section className="card muse-card">
              <div className="muse-label">📨 SUBMISSION</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '8px 0 12px', lineHeight: 1.5 }}>
                {brief?.submission_fields?.length ? `The ${brief.submission_fields.length} fields this hackathon asks for` : 'The standard Devpost fields'}, drafted from your idea, plan, log and notes so it reads like you wrote it. Anything the mentor can't back up is marked <b style={{ color: 'var(--yellow)' }}>[ADD: …]</b>. Edit freely; your changes save when you leave a field.
              </div>
              <button className="btn-primary muse-send" onClick={() => draftFields()} disabled={!!busy || !coach.idea}>{busy === 'submit' ? 'Writing your submission…' : !coach.idea ? 'Pick an idea first' : Object.values(fieldDraft).some((v) => String(v || '').trim()) ? '✍️ Redraft every field' : '✍️ Draft my submission'}</button>
              <ErrLine />
            </section>

            {brief?.requirements?.length > 0 && (
              <section className="card muse-card">
                <div className="muse-label" style={{ color: 'var(--yellow)' }}>BEFORE YOU SUBMIT · TICK EACH RULE</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                  {brief.requirements.map((r) => (
                    <label key={r} style={{ display: 'flex', gap: 8, fontSize: 13, lineHeight: 1.45, cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!reqChecks[r]} onChange={(e) => saveCoach({ req_checks: { ...reqChecks, [r]: e.target.checked } })} style={{ marginTop: 3 }} />
                      <span style={{ textDecoration: reqChecks[r] ? 'line-through' : 'none', color: reqChecks[r] ? 'var(--text-3)' : 'var(--text)' }}>{r}</span>
                    </label>
                  ))}
                </div>
              </section>
            )}

            {fields.map((f) => {
              const val = fieldDraft[f.key] || '';
              const over = f.limit && val.length > f.limit;
              const gap = /\[ADD:/i.test(val);
              return (
                <section key={f.key} className="card muse-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <label htmlFor={`hc-f-${f.key}`} style={{ fontWeight: 800, fontSize: 14.5 }}>{f.name}</label>
                    <span className="font-num" style={{ fontSize: 11, color: over ? 'var(--red)' : 'var(--text-3)' }}>{val.length}{f.limit ? `/${f.limit}` : ''}</span>
                  </div>
                  {f.hint && <div style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '2px 0 8px' }}>{f.hint}</div>}
                  <textarea id={`hc-f-${f.key}`} className="input" rows={f.key === 'tagline' || f.key === 'built_with' ? 2 : 5} style={{ resize: 'vertical', lineHeight: 1.55, borderColor: gap ? 'rgba(245,158,11,0.6)' : over ? 'rgba(239,68,68,0.6)' : undefined }}
                    value={val} onChange={(e) => setFieldDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                    onBlur={() => val !== (coach.submission?.fields?.[f.key] || '') && persistFields({ ...(coach.submission?.fields || {}), ...fieldDraft })} />
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <button className="muse-link" onClick={async () => { if (await copy(val)) { setCopied(f.key); setTimeout(() => setCopied(''), 1500); } }} disabled={!val}>{copied === f.key ? 'Copied ✓' : 'Copy'}</button>
                    <button className="muse-link" style={{ color: 'var(--text-2)' }} onClick={() => draftFields(f.key)} disabled={!!busy || !coach.idea}>{busy === `field:${f.key}` ? 'Rewriting…' : val ? 'Rewrite' : 'Write this'}</button>
                  </div>
                </section>
              );
            })}

            <section className="card muse-card">
              {coach.submission?.submitted_at ? (
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>📨 Marked as submitted on {new Date(coach.submission.submitted_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. Good luck!</div>
              ) : (
                <>
                  <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 10 }}>Submitted on the hackathon site? Mark it here so it moves to Awaiting judging.</div>
                  <button className="btn-primary" onClick={markSubmitted}>✅ I've submitted it</button>
                </>
              )}
            </section>
          </div></div>
        )}
        <div style={{ height: 140 }} />
      </div>
    </Layout>
  );
}
