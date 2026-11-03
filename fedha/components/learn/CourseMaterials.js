import { useEffect, useState } from 'react';
import { getMaterials, addMaterial, removeMaterial, pdfText } from '../../lib/materials';

// 📎 Class materials on a course: PDFs, GitHub repos, links and pasted notes that Professor Byte reads and teaches
// from (his research, lesson plans and explanations pull the parts that matter for each lesson).
const ICON = { pdf: '📄', github: '🐙', link: '🔗', text: '📝' };

export default function CourseMaterials({ course, onChange }) {
  const [list, setList] = useState([]);
  const [mode, setMode] = useState(null); // 'link' | 'text'
  const [val, setVal] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => { getMaterials(course.id).then(setList); }, [course.id]);
  const done = async () => { const l = await getMaterials(course.id); setList(l); onChange?.(l); setMode(null); setVal(''); setTitle(''); };
  const fromPdf = async (file) => {
    if (!file) return;
    setErr(''); setBusy('Reading the PDF…');
    try { const text = await pdfText(file, (i, n) => setBusy(`Reading the PDF… page ${i} of ${n}`)); await addMaterial(course.id, { kind: 'pdf', title: file.name.replace(/\.pdf$/i, ''), source: file.name, text }); await done(); }
    catch (e) { setErr(e.message || 'Could not read that PDF.'); } finally { setBusy(''); }
  };
  const fromLink = async () => {
    setErr(''); setBusy(/github\.com/i.test(val) ? 'Reading the repo (README and code)…' : 'Reading the page…');
    try {
      const r = await fetch('/api/materials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: val.trim() }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not read that.');
      await addMaterial(course.id, { kind: /github\.com/i.test(val) ? 'github' : 'link', title: j.title, source: val.trim(), text: j.text });
      await done();
    } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };
  const fromText = async () => {
    setErr('');
    try { await addMaterial(course.id, { kind: 'text', title: title.trim() || 'My notes', source: '', text: val }); await done(); } catch (e) { setErr(e.message); }
  };

  return (
    <div className="card-2" style={{ padding: 12, marginBottom: 10 }}>
      <div style={{ fontWeight: 800, fontSize: 13 }}>📎 Class materials</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '2px 0 8px' }}>Slides, PDFs, the course repo, articles. Byte reads them and teaches from them.</div>
      {list.map((m) => (
        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
          <span>{ICON[m.kind] || '📎'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{Math.round(m.chars / 1000)}k characters{m.chars > m.text.length ? ` (first ${Math.round(m.text.length / 1000)}k kept)` : ''}</div>
          </div>
          {m.source && /^https?:/.test(m.source) && <a href={m.source} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--blue)' }}>↗</a>}
          <button className="btn-icon" aria-label={`Remove ${m.title}`} onClick={async () => { await removeMaterial(course.id, m.id); await done(); }}>✕</button>
        </div>
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginTop: 6 }}>
        <label className="chip" style={{ justifyContent: 'center', cursor: 'pointer' }}>📄 PDF<input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => fromPdf(e.target.files?.[0])} /></label>
        <button className={`chip ${mode === 'link' ? 'active' : ''}`} style={{ justifyContent: 'center' }} onClick={() => { setMode(mode === 'link' ? null : 'link'); setErr(''); }}>🔗 Link / GitHub</button>
        <button className={`chip ${mode === 'text' ? 'active' : ''}`} style={{ justifyContent: 'center' }} onClick={() => { setMode(mode === 'text' ? null : 'text'); setErr(''); }}>📝 Paste</button>
      </div>
      {mode === 'link' && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input className="input" value={val} onChange={(e) => setVal(e.target.value)} placeholder="https://github.com/user/repo or any page" />
          <button className="btn-primary" disabled={!!busy || !/^https?:\/\//.test(val.trim())} onClick={fromLink}>Add</button>
        </div>
      )}
      {mode === 'text' && (
        <div style={{ marginTop: 8 }}>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Week 3 lecture notes)" />
          <textarea className="input" rows={5} style={{ marginTop: 6 }} value={val} onChange={(e) => setVal(e.target.value)} placeholder="Paste notes, a transcript, code…" />
          <button className="btn-primary" style={{ width: '100%', marginTop: 6 }} disabled={val.trim().length < 40} onClick={fromText}>Add</button>
        </div>
      )}
      {busy && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>{busy}</div>}
      {err && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{err}</div>}
      {list.length > 0 && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>Added after Byte prepared this course? Tap “Re-study with materials” below so his research includes them.</div>}
    </div>
  );
}
