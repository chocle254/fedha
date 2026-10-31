import { useState } from 'react';
import { resizeImage } from '../../lib/utils';

// Builds the curriculum for you (pages/api/curriculum.js): from the course link, a pasted syllabus, screenshots
// of the curriculum (for sites behind a login), or an AI-designed one. Shows a preview you can trim, then adds
// every lesson in one go (or replaces the current list).
const MODES = [['url', '🔗 From the link'], ['text', '📋 Paste the list'], ['image', '📷 Screenshots'], ['design', '✨ AI designs it']];
const ICON = { video: '🎬', check: '🧠', reading: '📖', assessment: '🏆', other: '📌' };

export default function CurriculumBuilder({ form, hasLessons, onAdd }) {
  const [mode, setMode] = useState(null);
  const [text, setText] = useState('');
  const [images, setImages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState(null);

  const run = async (m = mode) => {
    setBusy(true); setErr(''); setPreview(null);
    try {
      const r = await fetch('/api/curriculum', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: m, url: form.url, text, images, title: form.title, provider: form.provider, description: form.description }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not build the curriculum.');
      setPreview(j);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const pick = (m) => { setMode(m); setErr(''); setPreview(null); if (m === 'url' && form.url) run('url'); if (m === 'design' && form.title) run('design'); };
  const addShots = async (files) => {
    const list = [];
    for (const f of Array.from(files || []).slice(0, 5 - images.length)) { try { list.push(await resizeImage(f, 1400, 0.8)); } catch { /* skip that one */ } }
    setImages((x) => [...x, ...list].slice(0, 5));
  };
  const total = preview ? preview.sections.reduce((s, x) => s + x.lessons.length, 0) : 0;
  const mins = preview ? preview.sections.reduce((s, x) => s + x.lessons.reduce((a, l) => a + l.minutes, 0), 0) : 0;
  const dropLesson = (si, li) => setPreview((p) => ({ ...p, sections: p.sections.map((s, k) => (k === si ? { ...s, lessons: s.lessons.filter((_, j) => j !== li) } : s)).filter((s) => s.lessons.length) }));
  const apply = (replace) => {
    const modules = preview.sections.flatMap((s) => s.lessons.map((l) => ({ section: s.title, title: l.title, type: l.type, minutes: l.minutes, url: l.url || '' })));
    onAdd(modules, replace);
    setPreview(null); setMode(null); setText(''); setImages([]);
  };

  return (
    <div className="card-2" style={{ padding: 12, marginBottom: 12, border: '1px solid var(--accent-soft, rgba(16,185,129,.3))' }}>
      <div style={{ fontWeight: 800, fontSize: 13 }}>⚡ Build the curriculum for me</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '3px 0 9px' }}>No more typing lessons one by one.</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {MODES.map(([k, l]) => <button key={k} className={`chip ${mode === k ? 'active' : ''}`} style={{ justifyContent: 'center' }} disabled={busy} onClick={() => pick(k)}>{l}</button>)}
      </div>

      {mode === 'url' && !form.url && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>Put the course link in "Course link" above, then tap again.</div>}
      {mode === 'url' && form.url && !busy && !preview && <button className="btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => run('url')}>Read {form.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]} again</button>}
      {mode === 'design' && !form.title && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>Give the course a name above, then tap again.</div>}
      {mode === 'text' && (
        <>
          <textarea className="input" rows={6} style={{ marginTop: 8 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="On the course page, select the whole lesson list, copy it, and paste it here. Messy is fine." />
          <button className="btn-primary" style={{ width: '100%', marginTop: 6 }} disabled={busy || text.trim().length < 20} onClick={() => run('text')}>{busy ? 'Reading…' : 'Build it'}</button>
        </>
      )}
      {mode === 'image' && (
        <>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8 }}>Screenshot the curriculum (expand every section first), up to 5 pictures, in order.</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {images.map((src, i) => <div key={i} style={{ position: 'relative' }}><img src={src} alt={`Screenshot ${i + 1}`} style={{ width: 56, height: 84, objectFit: 'cover', borderRadius: 6 }} /><button onClick={() => setImages((x) => x.filter((_, k) => k !== i))} aria-label="Remove" style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, border: 0, background: '#000', color: '#fff', fontSize: 11 }}>✕</button></div>)}
            {images.length < 5 && <label className="btn-ghost" style={{ width: 56, height: 84, display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 22, padding: 0 }}>＋<input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => addShots(e.target.files)} /></label>}
          </div>
          <button className="btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={busy || !images.length} onClick={() => run('image')}>{busy ? 'Reading the screenshots…' : `Read ${images.length || ''} screenshot${images.length === 1 ? '' : 's'}`}</button>
        </>
      )}
      {busy && mode !== 'text' && mode !== 'image' && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>{mode === 'url' ? 'Reading the course page…' : 'Designing a curriculum…'}</div>}
      {err && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>{err}</div>}

      {preview && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800 }}>Found {total} lessons in {preview.sections.length} sections · ~{Math.round(mins / 6) / 10} h</div>
          {preview.note && <div style={{ fontSize: 11.5, color: 'var(--yellow, #F59E0B)', marginTop: 3 }}>{preview.note}</div>}
          <div style={{ maxHeight: 260, overflowY: 'auto', marginTop: 6 }}>
            {preview.sections.map((s, si) => (
              <div key={si} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--text-2)', padding: '4px 0' }}>§ {s.title}</div>
                {s.lessons.map((l, li) => (
                  <div key={li} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, padding: '3px 0' }}>
                    <span>{ICON[l.type] || '📌'}</span><span style={{ flex: 1 }}>{l.title}</span><span style={{ color: 'var(--text-3)', fontSize: 11 }}>{l.minutes}m</span>
                    <button onClick={() => dropLesson(si, li)} aria-label="Remove lesson" style={{ background: 'none', border: 0, color: 'var(--text-3)', cursor: 'pointer', fontSize: 12 }}>✕</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button className="btn-primary" style={{ flex: 1 }} onClick={() => apply(true)}>{hasLessons ? `Replace with these ${total}` : `Add all ${total} lessons`}</button>
            {hasLessons && <button className="btn-ghost" onClick={() => apply(false)}>Add to mine</button>}
          </div>
        </div>
      )}
    </div>
  );
}
