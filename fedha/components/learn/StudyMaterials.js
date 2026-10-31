import { useMemo, useState } from 'react';
import Md from './Md';

// Everything for what you're studying, and nothing else, so you never need to leave Study mode: the lesson's
// video (YouTube and Vimeo play right here), AI notes, your own notes (editable), the course's other lessons,
// your saved notes on it, and its flashcards to flip through.
function embedFor(url) {
  const u = String(url || '');
  const yt = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?rel=0&modestbranding=1`;
  const vm = u.match(/vimeo\.com\/(?:video\/)?(\d+)(?:\/(\w+))?/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}${vm[2] ? `?h=${vm[2]}` : ''}`;
  return null;
}
const words = (s) => String(s || '').toLowerCase().split(/[^a-z0-9+#]+/).filter((w) => w.length > 3);

function Lesson({ course, m, open: startOpen, onSaveLessonNotes }) {
  const [open, setOpen] = useState(!!startOpen);
  const [watch, setWatch] = useState(false);
  const embed = embedFor(m.url);
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
      <button onClick={() => setOpen(!open)} style={{ all: 'unset', boxSizing: 'border-box', width: '100%', display: 'flex', gap: 8, alignItems: 'center', padding: '10px', cursor: 'pointer' }}>
        <span>{m.completed ? '✅' : '📖'}</span><span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{m.title}</span><span style={{ fontSize: 11, color: 'var(--text-3)' }}>{m.minutes}m {open ? '⌃' : '⌄'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 10px 10px', borderTop: '1px solid var(--border)' }}>
          {m.url && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {embed && <button className="btn-primary" onClick={() => setWatch(!watch)}>{watch ? 'Hide video' : '▶ Watch here'}</button>}
              <a className="btn-ghost" href={m.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>Open link ↗</a>
            </div>
          )}
          {watch && embed && <div style={{ position: 'relative', paddingTop: '56.25%', marginTop: 8, borderRadius: 10, overflow: 'hidden', background: '#000' }}><iframe src={embed} title={m.title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} /></div>}
          {m.url && !embed && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 5 }}>Opens in your browser; the timer keeps running.</div>}
          {m.aiNotes ? <><div className="study-lbl">AI notes</div><Md text={m.aiNotes} /></> : null}
          <div className="study-lbl">My notes</div>
          <textarea className="input" rows={4} defaultValue={m.notes || ''} onBlur={(e) => e.target.value !== (m.notes || '') && onSaveLessonNotes(course, m.id, e.target.value)} placeholder="Write as you go. Saved when you tap away." />
        </div>
      )}
    </div>
  );
}

export default function StudyMaterials({ course, lesson, topic, notes, cards, onSaveLessonNotes, onAskTutor }) {
  const [openNote, setOpenNote] = useState(null);
  const [ci, setCi] = useState(0);
  const [flip, setFlip] = useState(false);

  // Only what belongs to this study: the course's notes and cards, or for free study, notes and cards whose
  // words match the topic.
  const related = useMemo(() => {
    const keys = words(topic);
    const hit = (txt) => keys.length > 0 && keys.some((k) => String(txt || '').toLowerCase().includes(k));
    const ns = course ? notes.filter((n) => n.course_id === course.id) : notes.filter((n) => hit(n.title) || hit(n.body));
    const cs = course ? cards.filter((c) => c.course_id === course.id && (!lesson || !c.lesson_id || c.lesson_id === lesson.id)) : cards.filter((c) => hit(c.topic) || hit(c.q));
    return { notes: ns.slice(0, 20), cards: cs.slice(0, 40) };
  }, [course, lesson, topic, notes, cards]);
  const card = related.cards[ci % Math.max(1, related.cards.length)];
  const others = (course?.modules || []).filter((m) => !lesson || m.id !== lesson.id);
  const empty = !course && !related.notes.length && !related.cards.length;

  return (
    <div>
      {course && <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>{course.title}{course.provider ? ` · ${course.provider}` : ''}{course.url ? <> · <a href={course.url} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)' }}>course site ↗</a></> : null}</div>}

      {lesson && <Lesson course={course} m={lesson} open onSaveLessonNotes={onSaveLessonNotes} />}

      {course && !lesson && (
        <>
          {course.description && <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 8 }}>{course.description}</div>}
          <div className="study-lbl">Course notes</div>
          <textarea className="input" rows={3} defaultValue={course.notes || ''} onBlur={(e) => e.target.value !== (course.notes || '') && onSaveLessonNotes(course, '__course__', e.target.value)} placeholder="Notes for the whole course…" />
        </>
      )}

      {course && others.length > 0 && <><div className="study-lbl">{lesson ? 'Other lessons in this course' : 'Lessons'}</div>{others.map((m) => <Lesson key={m.id} course={course} m={m} onSaveLessonNotes={onSaveLessonNotes} />)}</>}

      {related.notes.length > 0 && (
        <>
          <div className="study-lbl">Your notes on this ({related.notes.length})</div>
          {related.notes.map((n) => (
            <div key={n.id} className="card-2" style={{ padding: 10, marginBottom: 6 }}>
              <button onClick={() => setOpenNote(openNote === n.id ? null : n.id)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', width: '100%', fontSize: 13, fontWeight: 700 }}><span style={{ flex: 1 }}>📝 {n.title}</span><span>{openNote === n.id ? '⌃' : '⌄'}</span></button>
              {openNote === n.id && <Md text={n.body} style={{ marginTop: 6 }} />}
            </div>
          ))}
        </>
      )}

      {related.cards.length > 0 && card && (
        <>
          <div className="study-lbl">Flashcards on this ({related.cards.length})</div>
          <button onClick={() => setFlip(!flip)} className="card-2" style={{ all: 'unset', boxSizing: 'border-box', display: 'block', width: '100%', padding: 14, borderRadius: 12, cursor: 'pointer', minHeight: 90, background: flip ? 'rgba(16,185,129,.08)' : 'var(--card-2)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>{flip ? 'Answer' : 'Question · tap to flip'}</div>
            <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{flip ? card.a : card.q}</div>
          </button>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button className="btn-ghost" style={{ flex: 1 }} onClick={() => { setFlip(false); setCi((i) => (i - 1 + related.cards.length) % related.cards.length); }}>‹ Prev</button>
            <div style={{ alignSelf: 'center', fontSize: 12, color: 'var(--text-3)' }}>{(ci % related.cards.length) + 1}/{related.cards.length}</div>
            <button className="btn-ghost" style={{ flex: 1 }} onClick={() => { setFlip(false); setCi((i) => (i + 1) % related.cards.length); }}>Next ›</button>
          </div>
        </>
      )}

      {empty && (
        <div className="card-2" style={{ padding: 14, fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5, textAlign: 'center' }}>
          No saved material on {topic ? `"${topic}"` : 'this'} yet.
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={() => onAskTutor('normal')}>💡 Teach me this</button>
            <button className="btn-ghost" onClick={() => onAskTutor('simple')}>🧒 Start simple</button>
          </div>
        </div>
      )}
    </div>
  );
}
