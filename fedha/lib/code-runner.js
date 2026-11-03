// lib/code-runner.js — runs a small multi-file project on the phone and returns what it printed. Python runs in
// Pyodide (downloaded from the CDN the first time), JavaScript in a sandboxed Web Worker. A throwaway worker each
// run, so an endless loop is just killed by the timeout.
const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';

export function runProject({ lang, files, main }) {
  const py = /^py/.test(lang || 'python');
  const entry = main || (py ? (files.find((f) => /main\.py$/.test(f.name)) || files.find((f) => /\.py$/.test(f.name)))?.name : (files.find((f) => /(main|index)\.js$/.test(f.name)) || files.find((f) => /\.js$/.test(f.name)))?.name);
  if (!entry) return Promise.resolve({ error: `No ${py ? '.py' : '.js'} file to run.` });
  const src = py ? `
    importScripts('${PYODIDE}pyodide.js');
    const ready = loadPyodide({ indexURL: '${PYODIDE}' });
    onmessage = async (e) => {
      const { files, entry } = e.data; let out = '';
      try {
        const p = await ready;
        p.setStdout({ batched: (s) => { out += s + '\\n'; } });
        p.setStderr({ batched: (s) => { out += s + '\\n'; } });
        for (const f of files) { const parts = f.name.split('/'); for (let i = 1; i < parts.length; i++) { try { p.FS.mkdir(parts.slice(0, i).join('/')); } catch (x) {} } p.FS.writeFile(f.name, f.content); }
        p.runPython('import sys\\nsys.path.insert(0, ".")');
        await p.runPythonAsync(files.find((f) => f.name === entry).content);
        postMessage({ out });
      } catch (err) { postMessage({ out, error: String(err.message || err).split('\\n').slice(-4).join('\\n') }); }
    };` : `
    onmessage = (e) => {
      const { files, entry } = e.data; let out = '';
      const log = (...a) => { out += a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') + '\\n'; };
      const console = { log, error: log, warn: log, info: log };
      try { const code = files.filter((f) => f.name !== entry && /\\.js$/.test(f.name)).map((f) => f.content).join('\\n') + '\\n' + files.find((f) => f.name === entry).content; new Function('console', code)(console); postMessage({ out }); }
      catch (err) { postMessage({ out, error: String(err.message || err) }); }
    };`;
  return new Promise((resolve) => {
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    const t = setTimeout(() => { w.terminate(); resolve({ error: py ? 'Timed out. The first Python run downloads Python (~10 s); try again, or check for an endless loop.' : 'Timed out: an endless loop?' }); }, py ? 60000 : 6000);
    w.onmessage = (e) => { clearTimeout(t); w.terminate(); resolve({ ...e.data, entry }); };
    w.onerror = (e) => { clearTimeout(t); w.terminate(); resolve({ error: e.message }); };
    w.postMessage({ files, entry });
  });
}
