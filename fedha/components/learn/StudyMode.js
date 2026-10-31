import { useEffect, useRef, useState } from 'react';
import { studyText, learnerBrief, loadHomework, saveHomework, pendingHomework, homeworkKey } from '../../lib/study';
import { getSetting } from '../../lib/db';
import { getKb, buildKb, kbToMarkdown, kbForPrompt } from '../../lib/byte-kb';
import { genId, todayISO } from '../../lib/utils';
import { showNotif } from '../../lib/notifications';
import QuickQuiz from './QuickQuiz';
import TutorStage from './TutorStage';
import StudyMaterials from './StudyMaterials';
import StudyMusic from './StudyMusic';
import { useMusic } from '../../context/MusicContext';

// Study mode: pick what you're studying, run Pomodoro blocks, and keep an AI tutor beside you that works from
// your notes. Each finished focus block earns XP and offers a 3-question recall check before the break.
// The timer runs on the clock (end time), so it stays right if the phone sleeps or you switch apps.
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function StudyMode({ onSaveAiNotes, courses, notes, cards = [], log = [], prefs, start, onClose, onFocusDone, onQuizDone, onLessonDone, onSaveNote, onSaveLessonNotes, onPrefs }) {
  const [courseId, setCourseId] = useState(start?.courseId || courses.find((c) => c.status !== 'completed')?.id || '');
  const course = courses.find((c) => c.id === courseId);
  const lessons = course?.modules || [];
  const [lessonId, setLessonId] = useState(start?.lessonId || lessons.find((m) => !m.completed)?.id || '');
  const lesson = lessons.find((m) => m.id === lessonId);
  const [topic, setTopic] = useState('');
  const [p, setP] = useState(prefs);

  const [phase, setPhase] = useState('setup'); // setup | focus | recall | break
  const [endAt, setEndAt] = useState(null);
  const [pausedLeft, setPausedLeft] = useState(null);
  const [left, setLeft] = useState(prefs.focus * 60);
  const [blocks, setBlocks] = useState(0);
  const [focusedMin, setFocusedMin] = useState(0);

  const [tutorReq, setTutorReq] = useState(null);
  const [hwList, setHwList] = useState([]);
  const [classEnd, setClassEnd] = useState(null); // ms: when today's planner study block ends
  const wrapped = useRef(false);
  const hasMaterial = !!(start?.lessonId || start?.courseId);
  const [panel, setPanel] = useState(hasMaterial ? 'materials' : 'tutor');
  const music = useMusic();
  const pausedByBreak = useRef(false);
  const musicRef = useRef(music);
  musicRef.current = music;

  const subject = topic.trim() || lesson?.title || course?.title || 'my studies';
  const context = () => studyText(course, lesson, notes.filter((n) => n.course_id && n.course_id === courseId).slice(0, 4));
  // Professor Byte reads everything: the material plus a brief on how you're doing (lib/study.js).
  // Byte's stored research on this lesson (lib/byte-kb.js) goes first in everything he reads.
  const kbRef = useRef(null);
  useEffect(() => { kbRef.current = null; if (course && lesson) getKb(course.id, lesson.id).then((k) => { kbRef.current = k; }); }, [courseId, lessonId]); // eslint-disable-line react-hooks/exhaustive-deps
  const brief = () => {
    const b = learnerBrief({ course, lesson, topic: topic.trim() || subject, notes, cards, log });
    const k = kbForPrompt(kbRef.current);
    return { text: `${k ? `${k}\n\n` : ''}${b.text}`.slice(0, 14000), read: { ...b.read, kb: !!kbRef.current } };
  };
  // First time on a lesson: Byte researches it once and keeps it (and it becomes the lesson's notes if it has none).
  const prepare = async (onBuild) => {
    if (!course || !lesson || kbRef.current) return kbRef.current;
    const have = await getKb(course.id, lesson.id);
    if (have) { kbRef.current = have; return have; }
    onBuild?.();
    try {
      const kb = await buildKb(course, lesson);
      kbRef.current = kb;
      if (!lesson.aiNotes) onSaveAiNotes?.(course, lesson.id, kbToMarkdown(kb, lesson.title));
      return kb;
    } catch { return null; }
  };
  const planKey = `${courseId || 'free'}|${lessonId || ''}|${topic.trim().toLowerCase()}`;

  // Homework Byte set last class on this course (or free-study topic).
  const hwKey = homeworkKey(courseId, courseId ? '' : (topic.trim() || subject));
  const homework = pendingHomework(hwList, hwKey);
  useEffect(() => { loadHomework().then(setHwList); }, []);
  const storeHw = async (list) => { setHwList(list); await saveHomework(list); };
  const setHomework = (hw) => storeHw([{ id: genId(), key: hwKey, course_id: courseId || null, topic: subject, ...hw, status: 'pending', misses: 0, given_at: new Date().toISOString() }, ...hwList.filter((h) => !(h.key === hwKey && h.status === 'pending'))]);
  const gradeHomework = (grade, skipped) => homework && storeHw(hwList.map((h) => (h.id !== homework.id ? h : skipped || !grade?.done
    ? { ...h, misses: (h.misses || 0) + 1, last_check: new Date().toISOString(), note: grade?.note || 'Not done' }
    : { ...h, status: 'done', score: grade.score, ai_suspect: !!grade.ai_suspect, note: grade.note, checked_at: new Date().toISOString() })));

  // When today's planner study block ends: Byte wraps up and sets homework about 5 minutes before.
  useEffect(() => {
    const find = async () => {
      const [blocksToday, date] = await Promise.all([getSetting('planner_blocks', []), getSetting('planner_blocks_date', null)]);
      if (date !== todayISO() || !Array.isArray(blocksToday)) { setClassEnd(null); return; }
      const now = new Date(), mins = now.getHours() * 60 + now.getMinutes();
      const learning = blocksToday.filter((b) => b.type === 'learning' && /^\d{1,2}:\d{2}$/.test(b.time || '')).map((b) => { const [h, m] = b.time.split(':').map(Number); return { ...b, start: h * 60 + m, end: h * 60 + m + Number(b.duration || 0) }; });
      const nowBlock = learning.filter((b) => mins >= b.start && mins < b.end).sort((a, b) => (course && b.label.includes(course.title)) - (course && a.label.includes(course.title)))[0];
      if (!nowBlock) { setClassEnd(null); return; }
      const end = new Date(); end.setHours(0, 0, 0, 0); end.setMinutes(nowBlock.end);
      setClassEnd(end.getTime());
    };
    find(); const t = setInterval(find, 60000); return () => clearInterval(t);
  }, [course?.title]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!classEnd) return undefined;
    const check = () => {
      const left = classEnd - Date.now();
      if (!wrapped.current && left <= 5 * 60000 && left > -60000) {
        wrapped.current = true;
        setPanel('tutor');
        setTutorReq({ level: 'wrapup', n: Date.now(), minutesLeft: Math.max(1, Math.round(left / 60000)) });
        showNotif({ title: '🎓 Class is wrapping up', body: 'Professor Byte has your homework.', tag: 'study-wrapup' }).catch?.(() => {});
      }
    };
    check(); const t = setInterval(check, 15000); return () => clearInterval(t);
  }, [classEnd]);
  const total = (phase === 'focus' ? p.focus : phase === 'break' ? ((blocks % p.every === 0 && blocks) ? p.long : p.short) : p.focus) * 60;

  // Tick.
  useEffect(() => {
    if (!endAt) return undefined;
    const t = setInterval(() => {
      const s = Math.max(0, Math.round((endAt - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) { clearInterval(t); finishPhase(); }
    }, 500);
    return () => clearInterval(t);
  }, [endAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the screen awake while a block runs, where the browser allows it.
  useEffect(() => {
    let lock = null;
    if (endAt && navigator.wakeLock?.request) navigator.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => {});
    return () => { lock?.release?.().catch(() => {}); };
  }, [endAt]);

  const begin = (kind, minutes) => { setPhase(kind); setPausedLeft(null); setLeft(minutes * 60); setEndAt(Date.now() + minutes * 60 * 1000); };
  const startFocus = () => {
    onPrefs?.(p); begin('focus', p.focus);
    if (pausedByBreak.current && music.track && !music.playing) music.toggle?.();
    pausedByBreak.current = false;
  };
  const setMusicBreak = (on) => { const next = { ...p, musicBreak: on }; setP(next); onPrefs?.(next); };

  async function finishPhase() {
    setEndAt(null);
    if (phase === 'focus') {
      const n = blocks + 1;
      setBlocks(n); setFocusedMin((m) => m + p.focus);
      try { navigator.vibrate?.([200, 100, 200]); } catch { /* not supported */ }
      showNotif({ title: '🍅 Focus block done', body: `${p.focus} minutes on ${subject}. Quick recall, then a break.`, tag: 'study-pomodoro' }).catch?.(() => {});
      if (p.musicBreak && musicRef.current.playing) { musicRef.current.toggle?.(); pausedByBreak.current = true; }
      await onFocusDone({ minutes: p.focus, course_id: courseId || null, lesson_id: lessonId || null, topic: subject });
      setPhase('recall');
    } else {
      try { navigator.vibrate?.([120, 80, 120]); } catch { /* not supported */ }
      showNotif({ title: '⏰ Break over', body: 'Back to it. One more block.', tag: 'study-pomodoro' }).catch?.(() => {});
      setPhase('focus-ready');
    }
  }
  const takeBreak = () => begin('break', blocks % p.every === 0 ? p.long : p.short);
  const pause = () => { if (endAt) { setPausedLeft(Math.max(0, Math.round((endAt - Date.now()) / 1000))); setEndAt(null); } };
  const resume = () => { if (pausedLeft != null) { setEndAt(Date.now() + pausedLeft * 1000); setPausedLeft(null); } };
  const endSession = async () => {
    // Count the minutes of an unfinished focus block too (at least 5), so honest effort isn't lost.
    if (phase === 'focus') {
      const done = Math.floor(((p.focus * 60) - (pausedLeft ?? left)) / 60);
      if (done >= 5) await onFocusDone({ minutes: done, course_id: courseId || null, lesson_id: lessonId || null, topic: subject, partial: true });
    }
    onClose();
  };



  const ring = 2 * Math.PI * 88;
  const shownLeft = pausedLeft ?? left;
  const frac = phase === 'setup' || phase === 'recall' || phase === 'focus-ready' ? 1 : shownLeft / total;
  const color = phase === 'break' ? '#60A5FA' : '#10B981';

  return (
    <div className="study-overlay">
      <div className="study-wrap">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}><div style={{ fontWeight: 800, fontSize: 17 }}>🎧 Study mode</div><div style={{ fontSize: 12, color: 'var(--text-3)' }}>{blocks} block{blocks === 1 ? '' : 's'} · {focusedMin} min focused{classEnd ? ` · class ends ${new Date(classEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}{homework ? ' · 📌 homework due' : ''}</div></div>
          <button className="btn-ghost" onClick={endSession}>End</button>
        </div>

        {phase === 'setup' && (
          <div className="card" style={{ padding: 14, marginBottom: 14 }}>
            <label className="study-lbl">Course</label>
            <select className="input" value={courseId} onChange={(e) => { setCourseId(e.target.value); setLessonId(courses.find((c) => c.id === e.target.value)?.modules?.find((m) => !m.completed)?.id || ''); }}>
              <option value="">— Free study (no course) —</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.status === 'completed' ? '✓ ' : ''}{c.title}</option>)}
            </select>
            {lessons.length > 0 && <><label className="study-lbl">Lesson</label>
              <select className="input" value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
                <option value="">— Whole course —</option>
                {lessons.map((m) => <option key={m.id} value={m.id}>{m.completed ? '✓ ' : ''}{m.title}</option>)}
              </select></>}
            <label className="study-lbl">Topic (optional)</label>
            <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Transformers attention, React hooks…" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 10 }}>
              {[['focus', 'Focus'], ['short', 'Break'], ['long', 'Long break']].map(([k, l]) => (
                <label key={k} style={{ fontSize: 11, color: 'var(--text-3)' }}>{l} (min)<input className="input font-num" type="number" min="1" max="120" value={p[k]} onChange={(e) => setP({ ...p, [k]: Math.max(1, Math.min(120, Number(e.target.value) || 1)) })} /></label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {[[25, 5], [50, 10], [90, 20]].map(([f, s]) => <button key={f} className={`chip ${p.focus === f ? 'active' : ''}`} onClick={() => setP({ ...p, focus: f, short: s })}>{f}/{s}</button>)}
            </div>
          </div>
        )}

        {phase !== 'recall' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 14 }}>
            <svg width="200" height="200" viewBox="0 0 200 200">
              <circle cx="100" cy="100" r="88" fill="none" stroke="var(--border)" strokeWidth="10" />
              <circle cx="100" cy="100" r="88" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={ring} strokeDashoffset={ring * (1 - frac)} transform="rotate(-90 100 100)" style={{ transition: 'stroke-dashoffset .5s linear' }} />
              <text x="100" y="98" textAnchor="middle" fontSize="40" fontWeight="800" fill="var(--text)" className="font-num">{fmt(phase === 'setup' || phase === 'focus-ready' ? p.focus * 60 : shownLeft)}</text>
              <text x="100" y="128" textAnchor="middle" fontSize="13" fill="var(--text-3)">{phase === 'break' ? 'Break: stand, stretch, water' : phase === 'focus' ? (pausedLeft != null ? 'Paused' : 'Focus') : 'Ready'}</text>
            </svg>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4, textAlign: 'center' }}>{subject}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {(phase === 'setup' || phase === 'focus-ready') && <button className="btn-primary" style={{ padding: '12px 28px' }} onClick={startFocus}>▶ Start focus</button>}
              {(phase === 'focus' || phase === 'break') && (pausedLeft != null ? <button className="btn-primary" onClick={resume}>▶ Resume</button> : <button className="btn-ghost" onClick={pause}>⏸ Pause</button>)}
              {phase === 'break' && <button className="btn-ghost" onClick={() => { setEndAt(null); setPhase('focus-ready'); }}>Skip break</button>}
              {lesson && !lesson.completed && phase !== 'setup' && <button className="btn-ghost" style={{ color: 'var(--green)' }} onClick={() => onLessonDone(course, lesson.id)}>✓ Lesson done</button>}
            </div>
          </div>
        )}

        {phase === 'recall' && (
          <div style={{ marginBottom: 14 }}>
            <div className="card" style={{ padding: 14, marginBottom: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 30 }}>🍅</div>
              <div style={{ fontWeight: 800 }}>Block {blocks} done · +{p.focus} XP</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4 }}>Recall right after studying is the strongest way to remember it. 3 quick questions?</div>
            </div>
            <QuickQuiz compact context={context()} topic={subject} count={3} seconds={25} onDone={(r) => onQuizDone({ ...r, course_id: courseId || null, topic: subject })} onCancel={takeBreak} />
            <button className="btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={takeBreak}>Skip to break →</button>
          </div>
        )}

        <div className="tab-scroll" style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {[['materials', '📚 Materials'], ['tutor', '🤖 Tutor'], ['music', `🎵 Music${music.playing ? ' ♪' : ''}`]].map(([k, l]) => <button key={k} className={`chip ${panel === k ? 'active' : ''}`} onClick={() => setPanel(k)}>{l}</button>)}
        </div>
        <div className="card" style={{ padding: 12, marginBottom: 12, display: panel === 'materials' ? 'block' : 'none' }}>
          <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 8 }}>📚 {lesson ? lesson.title : course ? course.title : subject}</div>
          <StudyMaterials course={course} lesson={lesson} topic={topic.trim() || (!course ? subject : '')} notes={notes} cards={cards} onSaveLessonNotes={onSaveLessonNotes} onAskTutor={(lvl) => { setTutorReq({ level: lvl, n: Date.now() }); setPanel('tutor'); }} />
        </div>
        {/* kept mounted while hidden, so focus sounds keep playing when you switch panels */}
        <div className="card" style={{ padding: 12, marginBottom: 12, display: panel === 'music' ? 'block' : 'none' }}>
          <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 8 }}>🎵 Study music</div>
          <StudyMusic pauseOnBreak={p.musicBreak} onPauseOnBreak={setMusicBreak} />
        </div>
        <div className="card" style={{ padding: 12, display: panel === 'tutor' ? 'block' : 'none' }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>🎓 Professor Byte{course ? ` · reading your notes for ${lesson ? 'this lesson' : 'this course'}` : ''} · tap him, he reacts</div>
          <TutorStage prepare={prepare} homework={homework} onSetHomework={setHomework} onGradeHomework={gradeHomework} active={panel === 'tutor'} subject={subject} context={() => brief().text} brief={brief} planKey={planKey} onSaveNote={onSaveNote} courseId={courseId} request={tutorReq} />
        </div>
      </div>
    </div>
  );
}
