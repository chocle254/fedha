import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import {
  genId, todayISO, localISO, computeJobProgress, formatDate,
  summarizeSessions, buildDayPlan, fmtClock, fmtDuration, SESSION_CHECKPOINTS, BREAK_MOTIVATION,
} from '../lib/utils';

const JOB_CURRENCIES = { USD: '$', KES: 'KSh', EUR: '€', GBP: '£', UGX: 'USh', TZS: 'TSh' };
const fmt = (n, sym) => `${sym}${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PLAN_ICON = { shower: '🚿', work: '💻', eat: '🍽️', exercise: '🏃', break: '☕', done: '✅' };

// ─── ADD / EDIT JOB FORM ────────────────────────────────────────────────────────
function JobForm({ initial, onSave, onClose }) {
  const [name, setName] = useState(initial?.name || '');
  const [platform, setPlatform] = useState(initial?.platform || '');
  const [cur, setCur] = useState(initial?.currency || 'USD');
  const [perTask, setPerTask] = useState(initial?.perTask != null ? String(initial.perTask) : '');
  const [minutesPerTask, setMinutesPerTask] = useState(initial?.minutesPerTask != null ? String(initial.minutesPerTask) : '');
  const [threshold, setThreshold] = useState(initial?.threshold != null ? String(initial.threshold) : '20');
  const [multiplier, setMultiplier] = useState(initial?.multiplier || 1);

  const labelStyle = { fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 };

  function submit() {
    if (!name.trim()) return;
    onSave({
      ...initial,
      name: name.trim(),
      platform: platform.trim(),
      currency: cur,
      perTask: Number(perTask) || 0,
      minutesPerTask: Number(minutesPerTask) || 0,
      threshold: Number(threshold) || 20,
      multiplier: Number(multiplier) || 1,
    });
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '12px auto' }} />
        <div className="modal-header">
          <span style={{ fontSize: 16, fontWeight: 700 }}>{initial ? 'Edit Job' : 'Add Online Job'}</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div>
            <label style={labelStyle}>Job Name</label>
            <input className="input" placeholder="e.g. Atlas Labelling Tasks" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label style={labelStyle}>Platform (optional)</label>
            <input className="input" placeholder="e.g. Atlas" value={platform} onChange={(e) => setPlatform(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Pay Currency</label>
              <select className="input" value={cur} onChange={(e) => setCur(e.target.value)}>
                {Object.keys(JOB_CURRENCIES).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Pay / Task</label>
              <input className="input font-num" type="number" inputMode="decimal" placeholder="0.46" value={perTask} onChange={(e) => setPerTask(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Mins / Task</label>
              <input className="input font-num" type="number" inputMode="numeric" placeholder="e.g. 5" value={minutesPerTask} onChange={(e) => setMinutesPerTask(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Threshold</label>
              <input className="input font-num" type="number" inputMode="decimal" placeholder="20" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Goal Multiplier — aim for {multiplier}× the threshold</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[1, 1.5, 2, 3, 4].map((m) => (
                <button key={m} onClick={() => setMultiplier(m)}
                  style={{ flex: 1, padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit',
                    background: multiplier === m ? 'var(--blue)' : 'var(--card-2)',
                    border: `1px solid ${multiplier === m ? 'var(--blue)' : 'var(--border)'}`,
                    color: multiplier === m ? '#fff' : 'var(--text-2)' }}>
                  {m}×
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>
              Target this lock period: <strong style={{ color: 'var(--text)' }}>{fmt((Number(threshold) || 0) * multiplier, JOB_CURRENCIES[cur])}</strong>
            </div>
          </div>
          <button className="btn-primary" onClick={submit} disabled={!name.trim()}>{initial ? 'Save Changes' : 'Add Job'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── LOG EARNINGS MODAL ─────────────────────────────────────────────────────────
function LogModal({ job, onSave, onClose }) {
  const sym = JOB_CURRENCIES[job.currency] || '$';
  const [mode, setMode] = useState(job.perTask > 0 ? 'tasks' : 'amount');
  const [tasks, setTasks] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());

  const computedAmount = mode === 'tasks' ? (Number(tasks) || 0) * (Number(job.perTask) || 0) : Number(amount) || 0;
  const labelStyle = { fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 8 };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '12px auto' }} />
        <div className="modal-header">
          <span style={{ fontSize: 16, fontWeight: 700 }}>Log Earnings</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {job.perTask > 0 && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setMode('tasks')} style={{ flex: 1, padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit', background: mode === 'tasks' ? 'var(--green)' : 'var(--card-2)', border: `1px solid ${mode === 'tasks' ? 'var(--green)' : 'var(--border)'}`, color: mode === 'tasks' ? '#000' : 'var(--text-2)' }}>By Tasks</button>
              <button onClick={() => setMode('amount')} style={{ flex: 1, padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit', background: mode === 'amount' ? 'var(--green)' : 'var(--card-2)', border: `1px solid ${mode === 'amount' ? 'var(--green)' : 'var(--border)'}`, color: mode === 'amount' ? '#000' : 'var(--text-2)' }}>By Amount</button>
            </div>
          )}
          {mode === 'tasks' ? (
            <div>
              <label style={labelStyle}>Tasks Completed</label>
              <input className="input font-num" type="number" inputMode="numeric" placeholder="0" value={tasks} onChange={(e) => setTasks(e.target.value)} style={{ fontSize: 22, fontWeight: 600 }} autoFocus />
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>≈ {fmt(computedAmount, sym)} at {fmt(job.perTask, sym)}/task</div>
            </div>
          ) : (
            <div>
              <label style={labelStyle}>Amount Made ({job.currency})</label>
              <input className="input font-num" type="number" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ fontSize: 22, fontWeight: 600 }} autoFocus />
            </div>
          )}
          <div>
            <label style={labelStyle}>Date</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={() => { if (computedAmount > 0) { onSave({ id: genId(), date, amount: computedAmount, tasks: mode === 'tasks' ? Number(tasks) || 0 : null }); onClose(); } }} disabled={computedAmount <= 0}>
            ✓ Log {fmt(computedAmount, sym)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── STAT PILL ────────────────────────────────────────────────────────────────
function Stat({ label, value, accent }) {
  return (
    <div style={{ flex: 1, background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div className="font-num" style={{ fontSize: 18, fontWeight: 700, color: accent || 'var(--text)' }}>{value}</div>
    </div>
  );
}

// ─── NOTIFICATION HELPERS ───────────────────────────────────────────────────────
function requestNotify() {
  try { if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); } catch {}
}
function notify(title, body, opts = {}) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    new Notification(title, { body, tag: opts.tag, renotify: !!opts.renotify, silent: !!opts.silent });
  } catch {}
}

const BREAK_DEFAULT_MIN = { break: 20, eat: 45, exercise: 20, shower: 30 };
const BREAK_TITLE = { eat: 'Meal break 🍽️', exercise: 'Move your body 🏃', break: 'Reboot break ☕', shower: 'Shower & reset 🚿' };

// ─── FULL-SCREEN BREAK OVERLAY ────────────────────────────────────────────────────
// Blocks the whole app with a persistent countdown so the break actually happens.
// Remaining time is derived from `startedAt`, so closing/returning keeps counting.
function BreakOverlay({ brk, now, onEnd }) {
  const endsAt = new Date(brk.startedAt).getTime() + brk.mins * 60000;
  const remMs = Math.max(0, endsAt - now);
  const totalSec = Math.ceil(remMs / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  const pct = Math.min(100, ((brk.mins * 60000 - remMs) / (brk.mins * 60000)) * 100);
  const motivation = BREAK_MOTIVATION[Math.floor(now / 8000) % BREAK_MOTIVATION.length];
  const done = remMs <= 0;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(8,12,20,0.82)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28, textAlign: 'center' }}>
      <div style={{ fontSize: 64, marginBottom: 8 }}>{PLAN_ICON[brk.type] || '⏸️'}</div>
      <div style={{ fontSize: 13, color: 'var(--green)', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>{done ? 'Break complete' : 'Break time — step away'}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 18, maxWidth: 320 }}>{brk.msg}</div>

      <div className="font-num" style={{ fontSize: 72, fontWeight: 800, color: '#fff', lineHeight: 1, marginBottom: 16 }}>
        {mm}:{ss < 10 ? '0' + ss : ss}
      </div>

      <div style={{ width: 'min(320px, 80vw)', height: 8, background: 'rgba(255,255,255,0.15)', borderRadius: 4, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--green)', borderRadius: 4, transition: 'width 0.5s' }} />
      </div>

      <div style={{ fontSize: 15, color: 'rgba(237,242,255,0.85)', fontStyle: 'italic', maxWidth: 340, lineHeight: 1.5, marginBottom: 28 }}>“{motivation}”</div>

      {done ? (
        <button className="btn-primary" onClick={onEnd} style={{ background: 'var(--green)', color: '#000', maxWidth: 280 }}>I’m rebooted — back to work</button>
      ) : (
        <button onClick={onEnd} style={{ background: 'none', border: 'none', color: 'rgba(237,242,255,0.4)', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit', textDecoration: 'underline' }}>
          Skip break (not recommended)
        </button>
      )}
    </div>
  );
}

// ─── TODAY: WORK TIMER + WELLNESS REMINDERS ───────────────────────────────────────
function TodayPanel({ job, onUpdate }) {
  const sessions = job.sessions || [];
  const [now, setNow] = useState(Date.now());
  const firedRef = useRef(new Set());      // checkpoints whose break already triggered
  const preFiredRef = useRef(new Set());   // 5-min-before reminders already sent

  const { minutesToday, active } = summarizeSessions(sessions, new Date(now));
  const todaysSessions = sessions.filter((s) => s.date === localISO() && s.end);
  const activeBreak = job.activeBreak || null;

  // Tick every second while a session OR a break is running.
  useEffect(() => {
    if (!active && !activeBreak) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active, activeBreak]);

  // Notify once when a break's countdown reaches zero.
  const breakDoneNotified = useRef(false);
  useEffect(() => {
    if (!activeBreak) { breakDoneNotified.current = false; return; }
    const endsAt = new Date(activeBreak.startedAt).getTime() + activeBreak.mins * 60000;
    if (now >= endsAt && !breakDoneNotified.current) {
      breakDoneNotified.current = true;
      notify('Break over — back to work 💪', 'Your reboot is complete. Tap to resume.', { tag: 'break', renotify: true });
    }
  }, [now, activeBreak]);

  // Watch elapsed work time → 5-min warning, then start an enforced break.
  useEffect(() => {
    if (!active || activeBreak) return;
    const elapsed = (now - new Date(active.start).getTime()) / 60000;
    for (const cp of SESSION_CHECKPOINTS) {
      const preKey = `${active.id}-${cp.at}-pre`;
      if (elapsed >= cp.at - 5 && elapsed < cp.at && !preFiredRef.current.has(preKey)) {
        preFiredRef.current.add(preKey);
        notify(`${BREAK_TITLE[cp.type] || 'Break'} in 5 min`, `Wrap up your task — ${cp.msg}`, { tag: 'pre-break', renotify: true });
      }
      const key = `${active.id}-${cp.at}`;
      if (elapsed >= cp.at && !firedRef.current.has(key)) {
        firedRef.current.add(key);
        const brk = { id: genId(), type: cp.type, mins: cp.mins, msg: cp.msg, startedAt: new Date().toISOString() };
        notify(BREAK_TITLE[cp.type] || 'Break time', `${cp.msg} (${cp.mins} min)`, { tag: 'break', renotify: true });
        onUpdate({ ...job, activeBreak: brk });
      }
    }
  }, [now, active, activeBreak]); // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    requestNotify();
    const s = { id: genId(), date: localISO(), start: new Date().toISOString(), end: null };
    await onUpdate({ ...job, sessions: [...sessions, s] });
    setNow(Date.now());
  }
  async function stop() {
    await onUpdate({ ...job, activeBreak: null, sessions: sessions.map((s) => (s.id === active.id ? { ...s, end: new Date().toISOString() } : s)) });
    firedRef.current = new Set();
    preFiredRef.current = new Set();
    setNow(Date.now());
  }
  async function endBreak() {
    await onUpdate({ ...job, activeBreak: null });
    breakDoneNotified.current = false;
    setNow(Date.now());
  }

  return (
    <>
      {activeBreak && <BreakOverlay brk={activeBreak} now={now} onEnd={endBreak} />}
      <div className="card" style={{ padding: '16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="section-title" style={{ margin: 0 }}>⏱️ Today’s Work</div>
          <div className="font-num" style={{ fontSize: 13, color: 'var(--text-3)' }}>{fmtDuration(minutesToday)} tracked</div>
        </div>

        {active ? (
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>Working since {fmtClock(new Date(active.start).getHours() * 60 + new Date(active.start).getMinutes())}</div>
            <div className="font-num" style={{ fontSize: 34, fontWeight: 700, color: 'var(--green)', margin: '4px 0' }}>{fmtDuration((now - new Date(active.start).getTime()) / 60000)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Next break after 60 min of work</div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 12, lineHeight: 1.5 }}>Start the timer when you begin tasks. Fedha tracks your hours and locks the screen for a proper reboot break after each 60-min block so your eyes and mood stay fresh.</div>
        )}

        <button className="btn-primary" onClick={active ? stop : start}
          style={{ background: active ? 'var(--red)' : 'var(--green)', color: active ? '#fff' : '#000' }}>
          {active ? '■ End Work Session' : '▶ Start Work Session'}
        </button>

        {todaysSessions.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {todaysSessions.map((s) => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-3)' }}>
                <span>{fmtClock(new Date(s.start).getHours() * 60 + new Date(s.start).getMinutes())} – {fmtClock(new Date(s.end).getHours() * 60 + new Date(s.end).getMinutes())}</span>
                <span className="font-num">{fmtDuration((new Date(s.end) - new Date(s.start)) / 60000)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ─── DAY SCHEDULE PLAN ────────────────────────────────────────────────────────────
function DayPlan({ job, minutesPerDay, tasksPerDay, perTask, sym, onUpdate }) {
  const startTime = job.dayStart || '09:00';
  const { plan, endsAt } = buildDayPlan(minutesPerDay, startTime);

  // Tasks already submitted today → live countdown of tasks left for the day.
  const todayKey = localISO();
  const earnedToday = (job.entries || []).filter((e) => e.date === todayKey).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const doneToday = perTask > 0 ? Math.floor(earnedToday / perTask) : 0;
  const leftToday = tasksPerDay != null ? Math.max(0, tasksPerDay - doneToday) : null;
  const pct = tasksPerDay ? Math.min(100, (doneToday / tasksPerDay) * 100) : 0;

  return (
    <div className="card" style={{ padding: '16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div className="section-title" style={{ margin: 0 }}>🗓️ Your Day Plan</div>
        <input type="time" value={startTime} onChange={(e) => onUpdate({ ...job, dayStart: e.target.value })}
          className="input" style={{ width: 'auto', padding: '6px 8px', fontSize: 13 }} />
      </div>

      {leftToday != null && (
        <div style={{ padding: '12px 14px', background: leftToday === 0 ? 'rgba(34,197,94,0.12)' : 'var(--surface-2)', border: `1px solid ${leftToday === 0 ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`, borderRadius: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>Tasks left today</span>
            <span className="font-num" style={{ fontSize: 22, fontWeight: 800, color: leftToday === 0 ? 'var(--green)' : 'var(--text)' }}>{leftToday === 0 ? 'Done 🎉' : leftToday}</span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'var(--green)', borderRadius: 3, transition: 'width 0.4s' }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>{doneToday} of {tasksPerDay} done · log earnings to count them down</div>
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>~{fmtDuration(minutesPerDay)} of tasks today, balanced with proper reboot breaks. Wrap up around <strong style={{ color: 'var(--text)' }}>{fmtClock(endsAt)}</strong>.</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {plan.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: i < plan.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <div className="font-num" style={{ width: 64, fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>{fmtClock(item.start)}</div>
            <span style={{ fontSize: 18 }}>{PLAN_ICON[item.type] || '•'}</span>
            <div style={{ flex: 1, fontSize: 13, color: item.type === 'work' ? 'var(--text)' : 'var(--text-2)', fontWeight: item.type === 'work' ? 600 : 500 }}>{item.label}</div>
            {item.duration > 0 && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmtDuration(item.duration)}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── JOB DETAIL ───────────────────────────────────────────────────────────────
function JobDetail({ job, onBack }) {
  const { updateOnlineJob, removeOnlineJob } = useApp();
  const [showLog, setShowLog] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const sym = JOB_CURRENCIES[job.currency] || '$';

  // carry over the earned amount from the PREVIOUS lock period if the threshold wasn't met.
  const p = computeJobProgress(job);
  const entries = [...(job.entries || [])].sort((a, b) => b.date.localeCompare(a.date));

  async function addEntry(entry) {
    await updateOnlineJob({ ...job, entries: [...(job.entries || []), entry] });
  }
  async function deleteEntry(id) {
    await updateOnlineJob({ ...job, entries: (job.entries || []).filter((e) => e.id !== id) });
  }

  return (
    <div>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 14, cursor: 'pointer', fontFamily: 'Outfit', marginBottom: 14, padding: 0 }}>← All Jobs</button>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{job.name}</div>
          {job.platform && <div style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600 }}>{job.platform}</div>}
        </div>
        <button onClick={() => setShowEdit(true)} style={{ background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-2)', fontSize: 12, fontWeight: 600, padding: '8px 12px', cursor: 'pointer', fontFamily: 'Outfit' }}>Edit</button>
      </div>

      {/* Progress hero */}
      <div className="hero-card" style={{ padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 11, color: 'rgba(237,242,255,0.5)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>This Lock Period · {p.period.label}</div>
          <div style={{ fontSize: 11, color: 'rgba(237,242,255,0.5)', fontWeight: 600 }}>{job.multiplier}× goal</div>
        </div>
        <div className="font-num" style={{ fontSize: 30, fontWeight: 700, color: 'var(--green)', marginBottom: 2 }}>
          {fmt(p.earnedTotal, sym)} <span style={{ fontSize: 15, color: 'rgba(237,242,255,0.5)', fontWeight: 600 }}>/ {fmt(p.target, sym)}</span>
        </div>
        {p.carryover > 0 && <div style={{ fontSize: 12, color: '#F59E0B', fontWeight: 600, marginBottom: 8 }}>Includes {fmt(p.carryover, sym)} carried over from last period</div>}
        {/* progress bar */}
        <div style={{ height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden', margin: '10px 0' }}>
          <div style={{ height: '100%', width: `${p.progressPct}%`, background: p.metTarget ? 'var(--green)' : 'var(--blue)', borderRadius: 4, transition: 'width 0.3s' }} />
        </div>
        <div style={{ fontSize: 12, color: 'rgba(237,242,255,0.6)' }}>
          {p.metTarget
            ? `🎉 Goal smashed! You're ${fmt(p.earnedTotal - p.target, sym)} past your ${job.multiplier}× target.`
            : p.metThreshold
              ? `✓ Threshold of ${fmt(p.threshold, sym)} beaten — you'll get paid on the ${p.period.payout.getDate()}th. ${fmt(p.remaining, sym)} more to hit your ${job.multiplier}× goal.`
              : `${fmt(p.toThreshold, sym)} more to beat the ${fmt(p.threshold, sym)} threshold and unlock payout. Then ${fmt(p.remaining, sym)} more to reach your ${job.multiplier}× goal. Miss the threshold and it carries to next period.`}
        </div>
      </div>

      {/* Today's work timer + wellness reminders */}
      <TodayPanel job={job} onUpdate={updateOnlineJob} />

      {/* Calculator: tasks/day to hit goal */}
      <div className="card" style={{ padding: '16px', marginBottom: 16 }}>
        <div className="section-title" style={{ marginBottom: 12 }}>📊 Daily Plan to Hit Goal</div>
        {p.remaining <= 0 ? (
          <div style={{ fontSize: 14, color: 'var(--green)', fontWeight: 600 }}>You've reached your {job.multiplier}× goal — relax or get ahead for next period.</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <Stat label="Days left" value={p.daysLeft} />
              <Stat label="Per day" value={fmt(p.amountPerDay, sym)} accent="var(--blue)" />
            </div>
            {p.tasksRemaining != null ? (
              <div style={{ display: 'flex', gap: 10 }}>
                <Stat label="Tasks left" value={p.tasksRemaining} accent="var(--text)" />
                <Stat label="Tasks / day" value={p.tasksPerDay} accent="var(--green)" />
                {p.minutesPerDay != null && <Stat label="Mins / day" value={`~${p.minutesPerDay}`} accent="var(--text-2)" />}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.5 }}>Add a "Pay / Task" amount in the job settings to see exactly how many tasks per day you need.</div>
            )}
            {p.tasksPerDay != null && (
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 12, lineHeight: 1.5 }}>
                Do about <strong style={{ color: 'var(--text)' }}>{p.tasksPerDay} tasks/day</strong>{p.minutesPerDay != null ? ` (~${p.minutesPerDay} min)` : ''} for the next {p.daysLeft} days and you hit your goal without overworking.
              </div>
            )}
          </>
        )}
      </div>

      {/* Wellness-aware day schedule */}
      {p.minutesPerDay != null && p.minutesPerDay > 0 && (
        <DayPlan job={job} minutesPerDay={p.minutesPerDay} tasksPerDay={p.tasksPerDay} perTask={p.perTask} sym={sym} onUpdate={updateOnlineJob} />
      )}

      {/* Log button */}
      <button className="btn-primary" onClick={() => setShowLog(true)} style={{ marginBottom: 20, background: 'var(--green)', color: '#000' }}>+ Log Today's Earnings</button>

      {/* Entries */}
      <div className="section-title" style={{ marginBottom: 12 }}>Earnings Log</div>
      {entries.length === 0 ? (
        <div className="empty-state"><div className="icon">🧮</div><h3>No earnings logged yet</h3><p>Tap the button above each day you work</p></div>
      ) : entries.map((e) => (
        <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{formatDate(e.date)}</div>
            {e.tasks != null && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{e.tasks} tasks</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="font-num" style={{ fontSize: 15, fontWeight: 700, color: 'var(--green)' }}>+{fmt(e.amount, sym)}</div>
            <button onClick={() => deleteEntry(e.id)} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>
        </div>
      ))}

      <button onClick={() => { if (confirm('Delete this job and all its logs?')) { removeOnlineJob(job.id); onBack(); } }}
        style={{ width: '100%', marginTop: 20, padding: '12px', background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: 'var(--red)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit' }}>
        Delete Job
      </button>

      {showLog && <LogModal job={job} onSave={addEntry} onClose={() => setShowLog(false)} />}
      {showEdit && <JobForm initial={job} onSave={(d) => updateOnlineJob({ ...job, ...d })} onClose={() => setShowEdit(false)} />}
    </div>
  );
}

// ─── JOB LIST CARD ──────────────────────────────────────────────────────────────
function JobCard({ job, onOpen }) {
  const sym = JOB_CURRENCIES[job.currency] || '$';
  const p = computeJobProgress(job);
  return (
    <button onClick={onOpen} className="card" style={{ width: '100%', textAlign: 'left', padding: '16px', marginBottom: 12, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--card)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{job.name}</div>
          {job.platform && <div style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{job.platform}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="font-num" style={{ fontSize: 15, fontWeight: 700, color: 'var(--green)' }}>{fmt(p.earnedTotal, sym)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>of {fmt(p.target, sym)}</div>
        </div>
      </div>
      <div style={{ height: 6, background: 'var(--card-2)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
        <div style={{ height: '100%', width: `${p.progressPct}%`, background: p.metTarget ? 'var(--green)' : p.metThreshold ? 'var(--blue)' : '#F59E0B', borderRadius: 3 }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-3)' }}>
        <span>{p.period.label}</span>
        <span>{p.tasksPerDay != null && p.remaining > 0 ? `${p.tasksPerDay} tasks/day · ${p.daysLeft}d left` : p.remaining <= 0 ? 'Goal hit 🎉' : `${p.daysLeft}d left`}</span>
      </div>
    </button>
  );
}

// ─── MAIN ───────────────────────────────────────────────────────────────────────
export default function OnlineJobs() {
  const { onlineJobs, addOnlineJob } = useApp();
  const [openId, setOpenId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const openJob = onlineJobs.find((j) => j.id === openId);
  if (openJob) return <JobDetail job={openJob} onBack={() => setOpenId(null)} />;

  return (
    <div>
      <div style={{ padding: '12px 14px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 12, marginBottom: 16, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
        💼 Track the online gigs you actually do. Log what you earn each day and Fedha tells you how many tasks per day you need to beat your payout threshold — without overworking.
      </div>

      <button className="btn-primary" onClick={() => setShowAdd(true)} style={{ marginBottom: 20, background: 'var(--blue)' }}>+ Add Online Job</button>

      {onlineJobs.length === 0 ? (
        <div className="empty-state"><div className="icon">💼</div><h3>No jobs yet</h3><p>Add a job like Atlas labelling to start tracking earnings and daily targets</p></div>
      ) : (
        <>
          <div className="section-title" style={{ marginBottom: 12 }}>Your Jobs</div>
          {onlineJobs.map((j) => <JobCard key={j.id} job={j} onOpen={() => setOpenId(j.id)} />)}
        </>
      )}

      {showAdd && <JobForm onSave={(d) => addOnlineJob(d)} onClose={() => setShowAdd(false)} />}
    </div>
  );
}
