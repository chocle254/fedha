import { useEffect, useRef, useState } from 'react';
import { askStudy } from '../../lib/study';

// "Your turn to code": Byte writes an exercise for what he just taught, you write the code here, it runs on the
// phone against his tests (JavaScript straight away, Python with Pyodide loaded the first time you run Python),
// and he reviews it line by line like a CS lecturer. Plus real LeetCode problems on the topic to keep practising.
const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';

// Runs the code in a throwaway Web Worker so a bad loop can't freeze the app.
function runTests({ lang, code, fn, tests }) {
  return new Promise((resolve) => {
    const py = /^py/.test(lang);
    const src = py ? `
      importScripts('${PYODIDE}pyodide.js');
      let ready = loadPyodide({ indexURL: '${PYODIDE}' });
      onmessage = async (e) => {
        const { code, fn, tests } = e.data; const out = [];
        try {
          const py = await ready;
          py.runPython(code);
          const f = py.globals.get(fn);
          if (!f) throw new Error('No function named ' + fn);
          for (const t of tests) {
            try { let r = f(...t.args.map((a) => py.toPy(a))); if (r && r.toJs) r = r.toJs({ dict_converter: Object.fromEntries }); out.push({ args: t.args, expected: t.expected, got: r, ok: JSON.stringify(r) === JSON.stringify(t.expected) }); }
            catch (err) { out.push({ args: t.args, expected: t.expected, error: String(err.message || err).split('\\n').slice(-2).join(' '), ok: false }); }
          }
          postMessage({ out });
        } catch (err) { postMessage({ error: String(err.message || err).split('\\n').slice(-3).join(' ') }); }
      };` : `
      onmessage = (e) => {
        const { code, fn, tests } = e.data; const out = [];
        try {
          const f = new Function(code + '\\n;return typeof ' + fn + ' === "function" ? ' + fn + ' : null;')();
          if (!f) throw new Error('No function named ' + fn);
          for (const t of tests) {
            try { const r = f(...JSON.parse(JSON.stringify(t.args))); out.push({ args: t.args, expected: t.expected, got: r, ok: JSON.stringify(r) === JSON.stringify(t.expected) }); }
            catch (err) { out.push({ args: t.args, expected: t.expected, error: String(err.message || err), ok: false }); }
          }
          postMessage({ out });
        } catch (err) { postMessage({ error: String(err.message || err) }); }
      };`;
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    const t = setTimeout(() => { w.terminate(); resolve({ error: py ? 'Timed out (the first Python run downloads Python, try once more, or check for an endless loop).' : 'Timed out: an endless loop?' }); }, py ? 45000 : 4000);
    w.onmessage = (e) => { clearTimeout(t); w.terminate(); resolve(e.data); };
    w.onerror = (e) => { clearTimeout(t); w.terminate(); resolve({ error: e.message }); };
    w.postMessage({ code, fn, tests });
  });
}
const RUNNABLE = (lang) => /^(py|python|js|javascript)/.test(lang || '');

export default function CodePad({ lang = 'python', topic, goal, context, onClose, onSay }) {
  const [task, setTask] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [runs, setRuns] = useState(null);
  const [review, setReview] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const [showSol, setShowSol] = useState(false);
  const [lc, setLc] = useState(null);
  const [diff, setDiff] = useState('easy');
  const ta = useRef(null);

  const newTask = async (d = diff) => {
    setBusy('Writing your exercise…'); setErr(''); setRuns(null); setReview(null); setShowHint(false); setShowSol(false);
    try { const j = await askStudy({ type: 'code_task', topic, goal, lang, difficulty: d, context }); setTask(j.task); setCode(j.task.starter || ''); onSay?.(`Your turn. ${j.task.title}. Read the task, then write it yourself.`, 'excited'); }
    catch (e) { setErr(e.message); } finally { setBusy(''); }
  };
  useEffect(() => { newTask(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Editor keys: Tab indents 4 spaces, Enter keeps the indent (and adds one after a colon or brace).
  const onKey = (e) => {
    const el = e.target, a = el.selectionStart, z = el.selectionEnd;
    if (e.key === 'Tab') { e.preventDefault(); const v = code.slice(0, a) + '    ' + code.slice(z); setCode(v); requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = a + 4; }); }
    if (e.key === 'Enter') {
      const line = code.slice(0, a).split('\n').pop();
      const ind = (line.match(/^\s*/) || [''])[0] + (/[:{([]\s*$/.test(line) ? '    ' : '');
      e.preventDefault(); const v = `${code.slice(0, a)}\n${ind}${code.slice(z)}`; setCode(v);
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = a + 1 + ind.length; });
    }
  };

  const run = async () => {
    if (!task?.tests?.length || !task.fn) return;
    setBusy(/^py/.test(task.lang) ? 'Running your Python (the first time downloads Python, ~10 s)…' : 'Running your code…'); setErr('');
    const r = await runTests({ lang: task.lang, code, fn: task.fn, tests: task.tests });
    setBusy(''); setRuns(r);
    return r;
  };
  const submit = async () => {
    setBusy('Byte is reading your code…'); setErr('');
    let r = runs;
    if (RUNNABLE(task.lang) && task.tests?.length && !r) { r = await runTests({ lang: task.lang, code, fn: task.fn, tests: task.tests }); setRuns(r); }
    try {
      const j = await askStudy({ type: 'code_review', prompt: task.prompt, lang: task.lang, examples: task.examples, solution: task.solution, code, results: r?.out || (r?.error ? { error: r.error } : undefined) });
      setReview(j.review);
      onSay?.(j.review.say, j.review.verdict === 'pass' ? 'proud' : j.review.verdict === 'almost' ? 'thinking' : 'serious');
    } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };
  const leetcode = async () => {
    setBusy('Finding LeetCode problems…');
    try { setLc(await askStudy({ type: 'leetcode', topic, goal })); } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };

  const lines = code.split('\n').length;
  const passed = runs?.out?.filter((x) => x.ok).length || 0;
  return (
    <div className="card" style={{ padding: 12, marginTop: 10, border: '1px solid rgba(52,211,153,.4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 800, flex: 1 }}>💻 Your turn to code</div>
        <select className="input" style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }} value={diff} onChange={(e) => { setDiff(e.target.value); newTask(e.target.value); }}>
          <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
        </select>
        <button className="btn-icon" aria-label="Close" onClick={onClose}>✕</button>
      </div>
      {busy && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>{busy}</div>}
      {err && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>{err}</div>}
      {task && (
        <>
          <div style={{ fontWeight: 800, fontSize: 13.5, marginTop: 8 }}>{task.title}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{task.prompt}</div>
          {task.examples?.length > 0 && <div style={{ marginTop: 6, fontSize: 11.5, fontFamily: 'ui-monospace, Menlo, monospace', color: 'var(--text-3)' }}>{task.examples.map((x, i) => <div key={i}>in: {x.input} → out: {x.output}</div>)}</div>}
          <div style={{ display: 'flex', marginTop: 8, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', background: '#0A0D12' }}>
            <div aria-hidden="true" style={{ padding: '8px 6px', textAlign: 'right', color: 'rgba(255,255,255,.28)', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5, lineHeight: '19px', userSelect: 'none', background: 'rgba(255,255,255,.03)' }}>
              {Array.from({ length: Math.max(lines, 8) }, (_, i) => <div key={i} style={{ color: review?.lines?.some((l) => l.line === i + 1) ? '#FBBF24' : undefined }}>{i + 1}</div>)}
            </div>
            <textarea ref={ta} value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={onKey} spellCheck={false} autoCapitalize="off" autoCorrect="off"
              style={{ flex: 1, minHeight: Math.max(8, lines) * 19 + 16, padding: 8, border: 0, outline: 'none', resize: 'vertical', background: 'transparent', color: '#D1FAE5', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5, lineHeight: '19px', whiteSpace: 'pre', overflowX: 'auto' }} />
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {RUNNABLE(task.lang) && task.tests?.length > 0 && <button className="btn-ghost" disabled={!!busy} onClick={run}>▶ Run tests</button>}
            <button className="btn-primary" disabled={!!busy || code.trim().length < 5} onClick={submit}>✅ Hand it to Byte</button>
            <button className="btn-ghost" onClick={() => setShowHint(!showHint)}>💡 Hint</button>
            {(review || runs) && <button className="btn-ghost" onClick={() => setShowSol(!showSol)}>👀 Solution</button>}
            <button className="btn-ghost" disabled={!!busy} onClick={() => newTask()}>↻ Another</button>
          </div>
          {showHint && <div style={{ fontSize: 12.5, color: '#FDE68A', marginTop: 6 }}>💡 {task.hint}</div>}
          {runs?.error && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6, fontFamily: 'ui-monospace, Menlo, monospace' }}>⚠️ {runs.error}</div>}
          {runs?.out && (
            <div style={{ marginTop: 6, fontSize: 11.5, fontFamily: 'ui-monospace, Menlo, monospace' }}>
              <div style={{ fontWeight: 800, color: passed === runs.out.length ? 'var(--green)' : 'var(--yellow, #F59E0B)' }}>{passed}/{runs.out.length} tests pass</div>
              {runs.out.map((t, i) => <div key={i} style={{ color: t.ok ? 'var(--text-3)' : 'var(--red)' }}>{t.ok ? '✓' : '✗'} {task.fn}({t.args.map((a) => JSON.stringify(a)).join(', ')}) → {t.error ? `error: ${t.error}` : JSON.stringify(t.got)}{!t.ok && !t.error ? ` (expected ${JSON.stringify(t.expected)})` : ''}</div>)}
            </div>
          )}
          {review && (
            <div className="card-2" style={{ padding: 10, marginTop: 8 }}>
              <div style={{ fontWeight: 800, color: review.verdict === 'pass' ? 'var(--green)' : review.verdict === 'almost' ? '#F59E0B' : 'var(--red)' }}>{review.verdict === 'pass' ? '✅ It works' : review.verdict === 'almost' ? '🟡 Almost' : '❌ Not yet'}</div>
              <div style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>{review.say}</div>
              {review.lines?.map((l, i) => <div key={i} style={{ fontSize: 12, marginTop: 4 }}><b style={{ color: '#FBBF24' }}>Line {l.line}:</b> {l.note}</div>)}
              {review.fixed && review.verdict !== 'pass' && <pre style={{ fontSize: 11, marginTop: 6, background: 'rgba(0,0,0,.35)', padding: 8, borderRadius: 8, overflowX: 'auto' }}>{review.fixed}</pre>}
              {review.next && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>Next time: {review.next}</div>}
            </div>
          )}
          {showSol && <pre style={{ fontSize: 11, marginTop: 8, background: 'rgba(0,0,0,.35)', padding: 8, borderRadius: 8, overflowX: 'auto' }}>{task.solution}</pre>}
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 8 }}>
            {!lc ? <button className="btn-ghost" style={{ width: '100%' }} disabled={!!busy} onClick={leetcode}>🧩 LeetCode problems for this topic</button> : (
              <div>
                <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 4 }}>🧩 Practise on LeetCode</div>
                {lc.problems.map((x) => <a key={x.url} href={x.url} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 12.5, padding: '5px 0', color: 'var(--text)', textDecoration: 'none' }}><b>{x.title}</b> <span style={{ color: x.difficulty === 'Easy' ? 'var(--green)' : x.difficulty === 'Hard' ? 'var(--red)' : '#F59E0B' }}>{x.difficulty}</span>{x.verified ? '' : ' (unchecked)'} ↗<div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{x.why}</div></a>)}
                <a href={lc.search} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--blue)' }}>More on this topic ↗</a>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
