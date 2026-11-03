import { useState } from 'react';
import { levelOf, rankOf, liveStreak, isDue, MEDALS, askStudy, studyText, addDays } from '../../lib/study';
import { todayISO } from '../../lib/utils';
import QuickQuiz from './QuickQuiz';
import Md from './Md';
import { Medal, StreakFlame } from './Medal';

// The Learning home: where you stand (level, streak, today), what to do next (study, review, quiz, continue the
// next lesson), and a recap of what you studied this week.
export default function Today({ study, courses, onStudy, onTab, onRecap, onSaveNote, onQuizDone }) {
  const { stats, log, cards, notes } = study;
  const lv = levelOf(stats.xp);
  const today = todayISO();
  const todayMin = log.filter((e) => e.day === today && e.kind === 'focus').reduce((s, e) => s + (e.minutes || 0), 0);
  const todayXp = log.filter((e) => e.day === today).reduce((s, e) => s + (e.xp || 0), 0);
  const due = cards.filter(isDue).length;
  const streak = liveStreak(stats);
  const studiedToday = stats.last_day === today;

  // Next lesson: highest-priority active course, nearest deadline first.
  const next = courses.filter((c) => c.status !== 'completed' && (c.modules || []).some((m) => !m.completed))
    .sort((a, b) => (b.priority || 3) - (a.priority || 3) || String(a.deadline || '9').localeCompare(String(b.deadline || '9')))[0];
  const nextLesson = next?.modules.find((m) => !m.completed);

  const [recap, setRecap] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [quiz, setQuiz] = useState(false);

  const weekStart = addDays(today, -6);
  const doRecap = async () => {
    setBusy(true); setErr(''); setRecap(null);
    try {
      const touched = new Set(log.filter((e) => e.day >= weekStart && e.course_id).map((e) => e.course_id));
      const parts = [];
      for (const c of courses.filter((x) => touched.has(x.id))) {
        const ids = new Set(log.filter((e) => e.day >= weekStart && e.course_id === c.id && e.lesson_id).map((e) => e.lesson_id));
        const lessons = (c.modules || []).filter((m) => ids.has(m.id) && (m.aiNotes || m.notes));
        parts.push(lessons.length ? lessons.map((m) => studyText(c, m)).join('\n\n') : studyText(c));
      }
      const recentNotes = notes.filter((n) => String(n.updated_at || '').slice(0, 10) >= weekStart);
      for (const n of recentNotes) parts.push(`## ${n.title}\n${n.body}`);
      const topics = [...new Set(log.filter((e) => e.day >= weekStart && e.topic).map((e) => e.topic))];
      if (!parts.length && !topics.length) { setErr('Nothing studied in the last 7 days yet. Run a study session or add notes first.'); return; }
      const weak = cards.filter((c) => c.lapses > 0).sort((a, b) => b.lapses - a.lapses).slice(0, 8).map((c) => c.q);
      const j = await askStudy({ type: 'recap', period: 'this week', context: (topics.length ? `Topics studied: ${topics.join(', ')}\n\n` : '') + parts.join('\n\n').slice(0, 13000), weak });
      setRecap(j.text);
      onRecap();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const recent = MEDALS.filter((m) => stats.medals[m.id]).sort((a, b) => String(stats.medals[b.id]).localeCompare(String(stats.medals[a.id]))).slice(0, 4);

  return (
    <div>
      <div className="card learn-hero" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="lvl-badge"><span className="font-num">{lv.level}</span></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800 }}>{rankOf(lv.level)} · {stats.xp.toLocaleString()} XP</div>
            <div style={{ height: 6, background: 'var(--card-2)', borderRadius: 6, overflow: 'hidden', marginTop: 5 }}><div style={{ height: '100%', width: `${lv.pct}%`, background: 'linear-gradient(90deg,var(--green),var(--gold))' }} /></div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }} className="font-num">{lv.need - lv.into} XP to level {lv.level + 1}</div>
          </div>
          <div style={{ textAlign: 'center' }}><StreakFlame days={streak} lit={studiedToday} size={26} /><div className="font-num" style={{ fontWeight: 800 }}>{streak}</div></div>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 10 }}>
          {studiedToday ? <>Today: <b className="font-num">{todayMin} min</b> focused · <b className="font-num">+{todayXp} XP</b></> : streak ? `Study today to keep your ${streak}-day streak.` : 'One focus block today starts a streak.'}
        </div>
      </div>

      <button className="btn-primary study-cta" onClick={() => onStudy({})}>🎧 Start studying<span>Pomodoro + AI tutor</span></button>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '8px 0 12px' }}>
        <button className="card learn-tile" onClick={() => onTab('review')}><span style={{ fontSize: 22 }}>🃏</span><b>Review</b><span>{due ? `${due} card${due > 1 ? 's' : ''} due` : cards.length ? 'All caught up' : 'No cards yet'}</span></button>
        <button className="card learn-tile" onClick={() => setQuiz((q) => !q)}><span style={{ fontSize: 22 }}>⚡</span><b>Fast quiz</b><span>5 questions, 30s each</span></button>
      </div>
      {quiz && <QuizPicker courses={courses} notes={notes} onClose={() => setQuiz(false)} onDone={onQuizDone} />}

      {nextLesson && (
        <div className="card" style={{ padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-3)' }}>Up next</div>
          <div style={{ fontWeight: 800, marginTop: 4 }}>{nextLesson.title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{next.title} · {nextLesson.minutes} min{next.deadline ? ` · due ${next.deadline}` : ''}</div>
          <button className="btn-ghost" style={{ marginTop: 10, width: '100%' }} onClick={() => onStudy({ courseId: next.id, lessonId: nextLesson.id })}>▶ Study this lesson</button>
        </div>
      )}

      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1 }}><b>🔁 Weekly recap</b><div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Key ideas from the last 7 days, your weak spots, and 3 test questions.</div></div>
          <button className="btn-ghost" disabled={busy} onClick={doRecap}>{busy ? '…' : recap ? 'Redo' : 'Recap'}</button>
        </div>
        {err && <div style={{ color: 'var(--text-3)', fontSize: 12.5, marginTop: 8 }}>{err}</div>}
        {recap && <div style={{ marginTop: 10 }}><Md text={recap} /><button className="btn-ghost" style={{ marginTop: 8 }} onClick={() => { onSaveNote({ title: `Recap: week of ${weekStart}`, body: recap, course_id: null }); setRecap(null); }}>📝 Save to notes</button></div>}
      </div>

      {recent.length > 0 && (
        <button className="card" onClick={() => onTab('gains')} style={{ padding: 12, width: '100%', textAlign: 'left', cursor: 'pointer', color: 'var(--text)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>Latest medals · {Object.keys(stats.medals).length}/{MEDALS.length}</div>
          <div style={{ display: 'flex', gap: 10 }}>{recent.map((m) => <span key={m.id} title={m.name}><Medal id={m.id} earned size={44} /></span>)}</div>
        </button>
      )}
    </div>
  );
}

// Choose what to be quizzed on: a course, one lesson, your notes, or any topic.
export function QuizPicker({ courses, notes, onDone, onClose }) {
  const [courseId, setCourseId] = useState(courses.find((c) => c.status !== 'completed')?.id || '');
  const [lessonId, setLessonId] = useState('');
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState('medium');
  const [seconds, setSeconds] = useState(30);
  const [run, setRun] = useState(null);
  const course = courses.find((c) => c.id === courseId);
  const lesson = course?.modules?.find((m) => m.id === lessonId);

  if (run) return <div style={{ marginBottom: 12 }}><QuickQuiz key={run.key} {...run} onDone={(r) => onDone({ ...r, course_id: courseId || null, topic: run.topic })} onCancel={() => setRun(null)} /></div>;
  return (
    <div className="card" style={{ padding: 14, marginBottom: 12 }}>
      <select className="input" value={courseId} onChange={(e) => { setCourseId(e.target.value); setLessonId(''); }}>
        <option value="">Any topic (type below)</option>
        {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
      </select>
      {course?.modules?.length > 0 && <select className="input" style={{ marginTop: 8 }} value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
        <option value="">Whole course</option>{course.modules.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
      </select>}
      <input className="input" style={{ marginTop: 8 }} placeholder={course ? 'Focus on… (optional)' : 'Topic, e.g. SQL joins'} value={topic} onChange={(e) => setTopic(e.target.value)} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        {[5, 10, 15].map((n) => <button key={n} className={`chip ${count === n ? 'active' : ''}`} onClick={() => setCount(n)}>{n} Qs</button>)}
        {['easy', 'medium', 'hard'].map((d) => <button key={d} className={`chip ${difficulty === d ? 'active' : ''}`} onClick={() => setDifficulty(d)}>{d}</button>)}
        {[[15, '15s'], [30, '30s'], [0, 'no clock']].map(([s, l]) => <button key={s} className={`chip ${seconds === s ? 'active' : ''}`} onClick={() => setSeconds(s)}>⏱ {l}</button>)}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="btn-primary" style={{ flex: 1 }} disabled={!course && !topic.trim()} onClick={() => setRun({ key: Date.now(), context: course ? studyText(course, lesson, notes.filter((n) => n.course_id === courseId).slice(0, 4)) : '', topic: topic.trim() || lesson?.title || course?.title, count, difficulty, seconds })}>⚡ Start</button>
        {onClose && <button className="btn-ghost" onClick={onClose}>Close</button>}
      </div>
    </div>
  );
}
