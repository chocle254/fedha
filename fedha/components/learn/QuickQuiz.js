import { useEffect, useRef, useState } from 'react';
import { askStudy } from '../../lib/study';

// Fast quiz: AI writes multiple-choice questions from your notes (or the topic), one at a time against a clock.
// Every answer shows why. Wrong answers are handed back (onDone) so they become flashcards.
export default function QuickQuiz({ context, topic, count = 5, difficulty = 'medium', seconds = 30, onDone, onCancel, compact = false }) {
  const [qs, setQs] = useState(null);
  const [err, setErr] = useState('');
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);
  const [wrong, setWrong] = useState([]);
  const [left, setLeft] = useState(seconds);
  const [finished, setFinished] = useState(false);
  const started = useRef(false);

  const load = async () => {
    setErr(''); setQs(null);
    try { const j = await askStudy({ type: 'quiz', context, topic, count, difficulty }); setQs(j.questions); }
    catch (e) { setErr(e.message); }
  };
  useEffect(() => { if (!started.current) { started.current = true; load(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const q = qs?.[i];
  const answer = (idx) => {
    if (picked != null || !q) return;
    setPicked(idx);
    if (idx === q.answer) setScore((s) => s + 1);
    else setWrong((w) => [...w, q]);
  };
  // Clock per question; running out counts as wrong.
  useEffect(() => {
    if (!q || picked != null || finished || !seconds) return undefined;
    setLeft(seconds);
    const end = Date.now() + seconds * 1000;
    const t = setInterval(() => {
      const s = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) { clearInterval(t); answer(-1); }
    }, 250);
    return () => clearInterval(t);
  }, [i, qs, finished]); // eslint-disable-line react-hooks/exhaustive-deps

  const next = () => {
    if (i + 1 >= qs.length) { setFinished(true); onDone?.({ score, total: qs.length, wrong }); return; }
    setI(i + 1); setPicked(null);
  };

  if (err) return <div className="card-2" style={{ padding: 14 }}><div style={{ color: 'var(--red)', fontSize: 13 }}>{err}</div><div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button className="btn-primary" onClick={load}>Try again</button>{onCancel && <button className="btn-ghost" onClick={onCancel}>Close</button>}</div></div>;
  if (!qs) return <div className="card-2" style={{ padding: 18, textAlign: 'center', fontSize: 13, color: 'var(--text-2)' }}>✍️ Writing {count} questions{topic ? ` on ${topic}` : ''}…</div>;
  if (finished) {
    const pct = Math.round((score / qs.length) * 100);
    return (
      <div className="card-2" style={{ padding: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 40 }}>{pct === 100 ? '🎯' : pct >= 70 ? '💪' : pct >= 40 ? '📈' : '🔁'}</div>
        <div style={{ fontWeight: 800, fontSize: 20, marginTop: 4 }} className="font-num">{score}/{qs.length}</div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>{pct === 100 ? 'Perfect. You know this.' : pct >= 70 ? 'Solid. Review the misses below.' : pct >= 40 ? 'Partly there. The misses are now flashcards.' : 'Not yet. Re-read the notes, then try again tomorrow.'}</div>
        {wrong.length > 0 && <div style={{ textAlign: 'left', marginTop: 12 }}>{wrong.map((w, k) => <div key={k} style={{ fontSize: 12.5, padding: '8px 0', borderTop: '1px solid var(--border)' }}><b>{w.q}</b><div style={{ color: 'var(--green)', marginTop: 3 }}>✓ {w.options[w.answer]}</div>{w.why && <div style={{ color: 'var(--text-3)', marginTop: 2 }}>{w.why}</div>}</div>)}</div>}
        {wrong.length > 0 && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8 }}>🃏 {wrong.length} miss{wrong.length > 1 ? 'es' : ''} added to your flashcards.</div>}
        {onCancel && <button className="btn-ghost" style={{ marginTop: 12, width: '100%' }} onClick={onCancel}>Done</button>}
      </div>
    );
  }
  return (
    <div className="card-2" style={{ padding: compact ? 12 : 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text-3)', marginBottom: 6 }}>
        <span>Question {i + 1} of {qs.length}</span><span className="font-num">✓ {score}{seconds ? ` · ⏱ ${left}s` : ''}</span>
      </div>
      {seconds > 0 && <div style={{ height: 4, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}><div style={{ height: '100%', width: `${(left / seconds) * 100}%`, background: left <= 5 ? 'var(--red)' : 'var(--green)', transition: 'width .25s linear' }} /></div>}
      <div style={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.5, marginBottom: 10 }}>{q.q}</div>
      <div style={{ display: 'grid', gap: 7 }}>
        {q.options.map((o, k) => {
          const right = picked != null && k === q.answer, bad = picked === k && k !== q.answer;
          return <button key={k} onClick={() => answer(k)} disabled={picked != null} className="quiz-opt" style={{ borderColor: right ? 'var(--green)' : bad ? 'var(--red)' : 'var(--border)', background: right ? 'rgba(16,185,129,.12)' : bad ? 'rgba(239,68,68,.10)' : 'transparent' }}>
            <span style={{ fontWeight: 800, marginRight: 8, color: 'var(--text-3)' }}>{'ABCD'[k]}</span>{o}
          </button>;
        })}
      </div>
      {picked != null && (
        <div style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.5 }}>
          <div style={{ color: picked === q.answer ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{picked === q.answer ? 'Correct.' : picked === -1 ? "Time's up." : 'Not quite.'}</div>
          {q.why && <div style={{ color: 'var(--text-2)', marginTop: 3 }}>{q.why}</div>}
          <button className="btn-primary" style={{ width: '100%', marginTop: 10 }} onClick={next}>{i + 1 >= qs.length ? 'See score' : 'Next →'}</button>
        </div>
      )}
    </div>
  );
}
