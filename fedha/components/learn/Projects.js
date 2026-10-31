import { useState } from 'react';
import { genId } from '../../lib/utils';
import { askStudy, studyText } from '../../lib/study';

// Learning projects: build something that proves you can use what you learned. Milestones earn XP; shipping
// one (with a link to show it) earns a medal. AI can suggest small, free-to-build projects for a course.
export default function Projects({ courses, projects, onSave, onDelete, onMilestone, onShip }) {
  const [edit, setEdit] = useState(null);
  const [ideas, setIdeas] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ideaCourse, setIdeaCourse] = useState(courses[0]?.id || '');
  const active = projects.filter((p) => p.status !== 'shipped'), shipped = projects.filter((p) => p.status === 'shipped');

  const suggest = async () => {
    const c = courses.find((x) => x.id === ideaCourse);
    if (!c) return;
    setBusy(true); setErr(''); setIdeas(null);
    try { setIdeas((await askStudy({ type: 'project_ideas', topic: c.title, context: studyText(c) })).projects); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const blank = (over = {}) => ({ id: null, title: '', goal: '', course_id: '', link: '', milestones: [], status: 'active', ...over });
  const save = async () => {
    if (!edit.title.trim()) return;
    await onSave({ ...edit, id: edit.id || genId(), created_at: edit.created_at || new Date().toISOString(), milestones: edit.milestones.filter((m) => m.title.trim()) });
    setEdit(null);
  };

  const Card = ({ p }) => {
    const ms = p.milestones || [], done = ms.filter((m) => m.done).length, pct = ms.length ? Math.round((done / ms.length) * 100) : 0;
    return (
      <div className="card" style={{ padding: 14, marginBottom: 10, borderColor: p.status === 'shipped' ? 'rgba(245,197,107,.35)' : 'var(--border)' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ fontSize: 22 }}>{p.status === 'shipped' ? '🚀' : '🛠️'}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800 }}>{p.title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{courses.find((c) => c.id === p.course_id)?.title || 'Own project'}{ms.length ? ` · ${done}/${ms.length} milestones` : ''}</div>
            {p.goal && <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4 }}>{p.goal}</div>}
          </div>
        </div>
        {ms.length > 0 && <div style={{ height: 6, background: 'var(--card-2)', borderRadius: 6, overflow: 'hidden', margin: '10px 0 6px' }}><div style={{ height: '100%', width: `${pct}%`, background: p.status === 'shipped' ? 'var(--gold)' : 'var(--green)' }} /></div>}
        {ms.map((m) => (
          <label key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '5px 0', cursor: p.status === 'shipped' ? 'default' : 'pointer', opacity: m.done ? 0.65 : 1 }}>
            <input type="checkbox" checked={!!m.done} disabled={p.status === 'shipped'} onChange={() => onMilestone(p, m.id)} />
            <span style={{ textDecoration: m.done ? 'line-through' : 'none' }}>{m.title}</span>
          </label>
        ))}
        {p.link && <a href={p.link} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: 'var(--blue)', display: 'inline-block', marginTop: 6 }}>🔗 {p.link.replace(/^https?:\/\//, '').slice(0, 50)}</a>}
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {p.status !== 'shipped' && <button className="btn-primary" disabled={ms.length > 0 && done < ms.length} title={ms.length && done < ms.length ? 'Finish the milestones first' : ''} onClick={() => { const link = prompt('Link to show it (GitHub, live demo…), optional:', p.link || ''); if (link !== null) onShip({ ...p, link: link.trim() }); }}>🚀 Ship it</button>}
          <button className="btn-ghost" onClick={() => setEdit({ ...p, milestones: ms.map((m) => ({ ...m })) })}>Edit</button>
          <button className="btn-icon" aria-label="Delete project" onClick={() => confirm(`Delete "${p.title}"?`) && onDelete(p.id)}>✕</button>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="card" style={{ padding: 14, marginBottom: 14, background: 'linear-gradient(135deg,rgba(245,158,11,.10),rgba(16,185,129,.06))' }}>
        <div style={{ fontWeight: 800 }}>🛠️ Prove it by building it</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '4px 0 10px', lineHeight: 1.5 }}>Watching lessons is not the skill. A small shipped project is. Each milestone +30 XP, shipping +100 XP.</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn-primary" onClick={() => setEdit(blank())}>＋ Project</button>
          {courses.length > 0 && <><select className="input" style={{ flex: 1 }} value={ideaCourse} onChange={(e) => setIdeaCourse(e.target.value)}>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
            <button className="btn-ghost" disabled={busy} onClick={suggest}>{busy ? '…' : '✨ Ideas'}</button></>}
        </div>
        {err && <div style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 8 }}>{err}</div>}
        {ideas?.map((it, i) => (
          <div key={i} className="card-2" style={{ padding: 10, marginTop: 8 }}>
            <b style={{ fontSize: 13 }}>{it.title}</b><div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{it.goal}</div>
            <ol style={{ fontSize: 12, color: 'var(--text-3)', margin: '6px 0', paddingLeft: 18 }}>{(it.milestones || []).map((m, k) => <li key={k}>{m}</li>)}</ol>
            <button className="btn-ghost" onClick={async () => { await onSave({ ...blank({ title: it.title, goal: it.goal, course_id: ideaCourse }), id: genId(), created_at: new Date().toISOString(), milestones: (it.milestones || []).map((t) => ({ id: genId(), title: String(t), done: false })) }); setIdeas((l) => l.filter((_, k) => k !== i)); }}>＋ Start this one</button>
          </div>
        ))}
      </div>
      {active.map((p) => <Card key={p.id} p={p} />)}
      {shipped.length > 0 && <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-3)', margin: '16px 0 8px' }}>Shipped ({shipped.length})</div>}
      {shipped.map((p) => <Card key={p.id} p={p} />)}
      {!projects.length && <div className="card-2" style={{ padding: 18, fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>No projects yet. Start one, or tap ✨ Ideas for a course.</div>}

      {edit && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setEdit(null)}>
          <div className="modal-sheet" style={{ maxHeight: '92vh', overflowY: 'auto' }}>
            <div className="modal-header"><span style={{ fontWeight: 800 }}>{edit.id ? 'Edit project' : 'New project'}</span><button className="btn-icon" onClick={() => setEdit(null)}>✕</button></div>
            <div className="modal-body">
              <input className="input" placeholder="Project name" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
              <input className="input" style={{ marginTop: 8 }} placeholder="Goal: what will it do?" value={edit.goal} onChange={(e) => setEdit({ ...edit, goal: e.target.value })} />
              <select className="input" style={{ marginTop: 8 }} value={edit.course_id} onChange={(e) => setEdit({ ...edit, course_id: e.target.value })}>
                <option value="">No course</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
              <div style={{ fontSize: 12, fontWeight: 700, margin: '12px 0 6px' }}>Milestones</div>
              {edit.milestones.map((m, i) => (
                <div key={m.id} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input className="input" value={m.title} onChange={(e) => setEdit({ ...edit, milestones: edit.milestones.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)) })} />
                  <button className="btn-icon" onClick={() => setEdit({ ...edit, milestones: edit.milestones.filter((_, k) => k !== i) })}>✕</button>
                </div>
              ))}
              <button className="btn-ghost" style={{ width: '100%' }} onClick={() => setEdit({ ...edit, milestones: [...edit.milestones, { id: genId(), title: '', done: false }] })}>＋ Milestone</button>
              <button className="btn-primary" style={{ width: '100%', marginTop: 12 }} onClick={save}>Save project</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
