import { useMemo, useState } from 'react';
import { isDue, schedule, isMastered, newCard } from '../../lib/study';

// Flashcard review with spaced repetition: recall, reveal, grade yourself honestly. Cards you know come back
// less and less often; ones you miss come back tomorrow.
const GRADES = [
  { g: 0, label: 'Again', color: '#EF4444' }, { g: 1, label: 'Hard', color: '#F59E0B' },
  { g: 2, label: 'Good', color: '#10B981' }, { g: 3, label: 'Easy', color: '#60A5FA' },
];
const inDays = (n) => (n <= 0 ? 'today' : n === 1 ? '1d' : n < 30 ? `${n}d` : `${Math.round(n / 30)}mo`);

export default function Review({ cards, courses, onGrade, onSaveCards, onDelete }) {
  const [course, setCourse] = useState('all');
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(0);
  const [mode, setMode] = useState('review');
  const [draft, setDraft] = useState({ q: '', a: '' });
  const [search, setSearch] = useState('');
  const pool = useMemo(() => cards.filter((c) => course === 'all' || (course === 'none' ? !c.course_id : c.course_id === course)), [cards, course]);
  const due = pool.filter(isDue).sort((a, b) => String(a.due || '').localeCompare(String(b.due || '')));
  const card = due[0];
  const courseName = (id) => courses.find((c) => c.id === id)?.title || 'General';

  const grade = async (g) => { setShown(false); setDone((d) => d + 1); await onGrade(card, g); };
  const add = async () => {
    if (!draft.q.trim() || !draft.a.trim()) return;
    await onSaveCards([newCard({ ...draft, course_id: course !== 'all' && course !== 'none' ? course : null, source: 'me' })]);
    setDraft({ q: '', a: '' });
  };

  return (
    <div>
      <div className="tab-scroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 12 }}>
        <button className={`chip ${course === 'all' ? 'active' : ''}`} onClick={() => setCourse('all')}>All ({cards.filter(isDue).length} due)</button>
        {courses.filter((c) => cards.some((x) => x.course_id === c.id)).map((c) => <button key={c.id} className={`chip ${course === c.id ? 'active' : ''}`} onClick={() => setCourse(c.id)}>{c.title.slice(0, 22)} ({cards.filter((x) => x.course_id === c.id && isDue(x)).length})</button>)}
        {cards.some((x) => !x.course_id) && <button className={`chip ${course === 'none' ? 'active' : ''}`} onClick={() => setCourse('none')}>General</button>}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {[['review', '🃏 Review'], ['add', '＋ Add card'], ['browse', `📚 All cards (${pool.length})`]].map(([k, l]) => <button key={k} className={`chip ${mode === k ? 'active' : ''}`} onClick={() => setMode(k)}>{l}</button>)}
      </div>

      {mode === 'review' && (card ? (
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text-3)', marginBottom: 12 }}>
            <span>{courseName(card.course_id)}{card.topic ? ` · ${card.topic}` : ''}</span><span className="font-num">{due.length} left · {done} done</span>
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.5, minHeight: 60 }}>{card.q}</div>
          {shown ? (
            <>
              <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.25)', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{card.a}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '12px 0 6px' }}>How well did you recall it? Be honest: that is what makes mastery real.</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                {GRADES.map(({ g, label, color }) => (
                  <button key={g} onClick={() => grade(g)} className="btn-ghost" style={{ borderColor: color, color, padding: '9px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <b style={{ fontSize: 13 }}>{label}</b><span style={{ fontSize: 10.5, opacity: 0.8 }}>{inDays(schedule(card, g).interval)}</span>
                  </button>
                ))}
              </div>
            </>
          ) : <button className="btn-primary" style={{ width: '100%', marginTop: 16 }} onClick={() => setShown(true)}>Show answer</button>}
        </div>
      ) : (
        <div className="card" style={{ padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 38 }}>{pool.length ? '✅' : '🃏'}</div>
          <div style={{ fontWeight: 800, marginTop: 6 }}>{pool.length ? (done ? `Done: ${done} reviewed` : 'Nothing due right now') : 'No flashcards yet'}</div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.5 }}>{pool.length ? `Next card is due ${inDays(Math.min(...pool.map((c) => Math.round((new Date(c.due + 'T12:00:00') - Date.now()) / 864e5))))}. Come back then: spacing is what makes it stick.` : 'Make cards from any lesson or note (Notes tab → 🃏 Flashcards), or add your own. Missed quiz questions become cards automatically.'}</div>
        </div>
      ))}

      {mode === 'add' && (
        <div className="card" style={{ padding: 14 }}>
          <textarea className="input" rows={2} placeholder="Question (make yourself recall: why / how / what is…)" value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} />
          <textarea className="input" rows={3} style={{ marginTop: 8 }} placeholder="Answer (short and exact)" value={draft.a} onChange={(e) => setDraft({ ...draft, a: e.target.value })} />
          <button className="btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={add}>Add card{course !== 'all' && course !== 'none' ? ` to ${courseName(course)}` : ''}</button>
        </div>
      )}

      {mode === 'browse' && (
        <div>
          <input className="input" placeholder="Search cards…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 8 }} />
          {pool.filter((c) => !search || (c.q + c.a).toLowerCase().includes(search.toLowerCase())).slice(0, 200).map((c) => (
            <div key={c.id} className="card-2" style={{ padding: 10, marginBottom: 6, display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, fontSize: 12.5 }}><b>{c.q}</b><div style={{ color: 'var(--text-2)', marginTop: 3 }}>{c.a}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{isMastered(c) ? '💎 mastered' : c.reps ? `next in ${inDays(Math.round((new Date(c.due + 'T12:00:00') - Date.now()) / 864e5))}` : 'new'}{c.lapses ? ` · missed ${c.lapses}×` : ''} · {courseName(c.course_id)}</div></div>
              <button className="btn-icon" aria-label="Delete card" onClick={() => confirm('Delete this card?') && onDelete(c.id)}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
