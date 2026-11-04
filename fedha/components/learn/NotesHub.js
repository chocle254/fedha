import { useMemo, useState } from 'react';
import { askStudy, studyText, newCard } from '../../lib/study';
import QuickQuiz from './QuickQuiz';
import Md from './Md';

// Every note in one place: lesson notes (AI + yours) from your courses, plus your own free notes.
// From any note: tidy it with AI, explain it, turn it into flashcards, or get quizzed on it.
export default function NotesHub({ courses, notes, cards, onSaveNote, onDeleteNote, onSaveCards, onQuizDone, onStudy }) {
  const [search, setSearch] = useState('');
  const [course, setCourse] = useState('all');
  const [open, setOpen] = useState(null);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState('');
  const [out, setOut] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [msg, setMsg] = useState('');

  const all = useMemo(() => {
    const list = [];
    for (const c of courses) {
      for (const m of c.modules || []) if (m.aiNotes || m.notes) list.push({ key: `l:${c.id}:${m.id}`, kind: 'lesson', title: m.title, sub: `${c.title} · ${m.section || 'Course content'}`, body: [m.aiNotes, m.notes && `### My notes\n${m.notes}`].filter(Boolean).join('\n\n'), course: c, lesson: m, at: c.updated_at || c.created_at });
      if (c.notes) list.push({ key: `c:${c.id}`, kind: 'course', title: `${c.title}: course notes`, sub: c.provider || 'Course', body: c.notes, course: c, at: c.created_at });
    }
    for (const n of notes) list.push({ key: `n:${n.id}`, kind: 'note', title: n.title || 'Untitled', sub: courses.find((c) => c.id === n.course_id)?.title || 'My note', body: n.body, note: n, course: courses.find((c) => c.id === n.course_id), at: n.updated_at });
    // Never the same card twice (a duplicated course or lesson id made cards stick when switching tabs).
    const seen = new Set();
    return list.filter((x) => (seen.has(x.key) ? false : seen.add(x.key))).sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  }, [courses, notes]);
  const shown = all.filter((x) => (course === 'all' || x.course?.id === course) && (!search || (x.title + x.body + x.sub).toLowerCase().includes(search.toLowerCase())));

  const ctxOf = (x) => (x.kind === 'note' ? `## ${x.title}\n${x.body}` : x.kind === 'lesson' ? studyText(x.course, x.lesson) : x.body);
  const run = async (x, what) => {
    setBusy(what); setOut(null); setMsg('');
    try {
      if (what === 'cards') {
        const j = await askStudy({ type: 'cards', context: ctxOf(x), topic: x.title, count: 10, avoid: cards.filter((c) => c.course_id === x.course?.id).map((c) => c.q) });
        await onSaveCards(j.cards.map((c) => newCard({ ...c, course_id: x.course?.id || null, lesson_id: x.lesson?.id || null, topic: x.title })));
        setMsg(`🃏 ${j.cards.length} flashcards added. Review them in the Review tab.`);
      } else if (what === 'tidy') {
        const j = await askStudy({ type: 'summarize_note', context: ctxOf(x) });
        setOut({ key: x.key, title: `${x.title} (tidied)`, text: j.text, course_id: x.course?.id || null });
      } else {
        const j = await askStudy({ type: 'explain', level: what, topic: x.title, context: ctxOf(x) });
        setOut({ key: x.key, title: `${x.title}: explained`, text: j.text, course_id: x.course?.id || null });
      }
    } catch (e) { setMsg(`⚠️ ${e.message}`); } finally { setBusy(''); }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input className="input" placeholder="Search all notes…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn-primary" style={{ whiteSpace: 'nowrap' }} onClick={() => setEdit({ title: '', body: '', course_id: course !== 'all' ? course : '' })}>＋ Note</button>
      </div>
      <div className="tab-scroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 12 }}>
        <button className={`chip ${course === 'all' ? 'active' : ''}`} onClick={() => setCourse('all')}>All ({all.length})</button>
        {courses.filter((c, i) => courses.findIndex((y) => y.id === c.id) === i && all.some((x) => x.course?.id === c.id)).map((c) => <button key={c.id} className={`chip ${course === c.id ? 'active' : ''}`} onClick={() => setCourse(c.id)}>{c.title.slice(0, 22)}</button>)}
      </div>
      {!shown.length && <div className="card-2" style={{ padding: 18, fontSize: 13, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.5 }}>{all.length ? 'No notes match.' : 'No notes yet. Write one here, generate AI notes on a lesson, or save a tutor answer from Study mode.'}</div>}
      {shown.map((x) => (
        <div key={x.key} className="card" style={{ padding: 12, marginBottom: 8 }}>
          <button onClick={() => { setOpen(open === x.key ? null : x.key); setOut(null); setQuiz(null); setMsg(''); }} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}><span>{x.kind === 'lesson' ? '📖' : x.kind === 'course' ? '🎓' : '📝'}</span><b style={{ flex: 1, fontSize: 13.5 }}>{x.title}</b><span style={{ fontSize: 12 }}>{open === x.key ? '⌃' : '⌄'}</span></div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{x.sub}</div>
            {open !== x.key && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{x.body.replace(/[#*`]/g, '')}</div>}
          </button>
          {open === x.key && (
            <div style={{ marginTop: 8 }}>
              <Md text={x.body} />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                <button className="chip" disabled={!!busy} onClick={() => run(x, 'cards')}>{busy === 'cards' ? '…' : '🃏 Flashcards'}</button>
                <button className="chip" disabled={!!busy} onClick={() => setQuiz(x)}>⚡ Quiz me</button>
                <button className="chip" disabled={!!busy} onClick={() => run(x, 'simple')}>{busy === 'simple' ? '…' : '🧒 Explain simply'}</button>
                <button className="chip" disabled={!!busy} onClick={() => run(x, 'example')}>{busy === 'example' ? '…' : '🧪 Examples'}</button>
                <button className="chip" disabled={!!busy} onClick={() => run(x, 'tidy')}>{busy === 'tidy' ? '…' : '✨ Tidy up'}</button>
                <button className="chip" onClick={() => onStudy({ courseId: x.course?.id, lessonId: x.lesson?.id })}>🎧 Study this</button>
                {x.kind === 'note' && <><button className="chip" onClick={() => setEdit({ ...x.note, course_id: x.note.course_id || '' })}>✏️ Edit</button><button className="chip" onClick={() => confirm('Delete this note?') && onDeleteNote(x.note.id)}>🗑</button></>}
              </div>
              {msg && <div style={{ fontSize: 12.5, marginTop: 8, color: msg.startsWith('⚠️') ? 'var(--red)' : 'var(--green)' }}>{msg}</div>}
              {out?.key === x.key && (
                <div className="card-2" style={{ padding: 12, marginTop: 10 }}>
                  <Md text={out.text} />
                  <button className="btn-ghost" style={{ marginTop: 8 }} onClick={async () => { await onSaveNote({ title: out.title, body: out.text, course_id: out.course_id }); setOut(null); setMsg('📝 Saved as a new note.'); }}>📝 Save as note</button>
                </div>
              )}
              {quiz?.key === x.key && <div style={{ marginTop: 10 }}><QuickQuiz context={ctxOf(x)} topic={x.title} count={5} onDone={(r) => onQuizDone({ ...r, course_id: x.course?.id || null, topic: x.title })} onCancel={() => setQuiz(null)} /></div>}
            </div>
          )}
        </div>
      ))}

      {edit && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setEdit(null)}>
          <div className="modal-sheet" style={{ maxHeight: '92vh', overflowY: 'auto' }}>
            <div className="modal-header"><span style={{ fontWeight: 800 }}>{edit.id ? 'Edit note' : 'New note'}</span><button className="btn-icon" onClick={() => setEdit(null)}>✕</button></div>
            <div className="modal-body">
              <input className="input" placeholder="Title" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
              <select className="input" style={{ marginTop: 8 }} value={edit.course_id} onChange={(e) => setEdit({ ...edit, course_id: e.target.value })}>
                <option value="">No course</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
              <textarea className="input" rows={14} style={{ marginTop: 8, fontFamily: 'inherit' }} placeholder={'Write freely. Markdown works: # heading, - bullet, **bold**, `code`'} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} />
              <button className="btn-primary" style={{ width: '100%', marginTop: 10 }} onClick={async () => { if (!edit.title.trim() && !edit.body.trim()) return; await onSaveNote({ ...edit, course_id: edit.course_id || null }); setEdit(null); }}>Save note</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
