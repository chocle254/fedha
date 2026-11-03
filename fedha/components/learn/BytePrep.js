import { useEffect, useRef, useState } from 'react';
import { buildKb, kbStatus, kbToMarkdown, getKb } from '../../lib/byte-kb';

// "🧠 Byte, prepare this course": Byte researches every lesson of the curriculum once (lib/byte-kb.js), one after
// another, and stores it. Lessons without notes get his research as their AI notes. Stops if you close it;
// pressing again carries on from where it stopped (finished lessons are skipped).
export default function BytePrep({ course, onSaveCourse, hasMaterials }) {
  const [st, setSt] = useState({ ready: 0, total: (course.modules || []).length });
  const [running, setRunning] = useState(false);
  const [now, setNow] = useState('');
  const [err, setErr] = useState('');
  const stop = useRef(false);
  const work = useRef(course);
  work.current = running ? work.current : course;

  useEffect(() => { kbStatus(course).then(setSt); }, [course.id, (course.modules || []).length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { stop.current = true; }, []);

  const run = async (force = false) => {
    stop.current = false; setRunning(true); setErr('');
    let c = { ...course, modules: [...(course.modules || [])] };
    work.current = c;
    for (const m of c.modules) {
      if (stop.current) break;
      if (!force && await getKb(c.id, m.id)) continue;
      setNow(m.title);
      try {
        const kb = await buildKb(c, m);
        if (!m.aiNotes) {
          c = { ...c, modules: c.modules.map((x) => (x.id === m.id ? { ...x, aiNotes: kbToMarkdown(kb, x.title) } : x)) };
          work.current = c;
          await onSaveCourse(c);
        }
        setSt(await kbStatus(c));
      } catch (e) {
        setErr(/busy|429/i.test(e.message) ? 'The free AI is busy. Byte paused; press again in a minute to carry on.' : e.message);
        break;
      }
      await new Promise((r) => setTimeout(r, 1500)); // gentle on the free AI limits
    }
    setRunning(false); setNow('');
  };

  if (!st.total) return null;
  const done = st.ready >= st.total;
  const pct = Math.round((st.ready / st.total) * 100);
  return (
    <div className="card-2" style={{ padding: 12, marginBottom: 10, border: '1px solid rgba(125,249,255,.25)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 20 }}>🧠</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 13 }}>{done ? 'Byte has studied this whole course' : running ? 'Byte is studying…' : 'Byte, prepare this course'}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{st.ready}/{st.total} lessons researched{running && now ? ` · now: ${now}` : ''}</div>
        </div>
        {!done && (running
          ? <button className="btn-ghost" onClick={() => { stop.current = true; }}>Pause</button>
          : <button className="btn-primary" onClick={() => run()}>{st.ready ? 'Carry on' : 'Start'}</button>)}
        {done && hasMaterials && !running && <button className="btn-ghost" onClick={() => run(true)}>Re-study with materials</button>}
      </div>
      <div style={{ height: 4, borderRadius: 3, background: 'var(--border)', overflow: 'hidden', marginTop: 8 }}><div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#7DF9FF,#34D399)', transition: 'width .6s' }} /></div>
      {!done && !running && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>He researches each lesson once (concepts, the deep version, examples, mistakes, checks) and keeps it, so he never starts from scratch again. Lessons with no notes get his as notes.</div>}
      {err && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{err}</div>}
    </div>
  );
}
