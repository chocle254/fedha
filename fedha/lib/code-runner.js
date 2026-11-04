// lib/code-runner.js — runs a small multi-file project on the phone and returns what it printed. Python runs in
// Pyodide (downloaded from the CDN the first time), JavaScript in a sandboxed Web Worker.
// Python: one worker is kept warm between runs (starting Python each time took seconds), and before each run the
// packages your code imports are installed: numpy, pandas, scikit-learn, matplotlib... come from Pyodide's own
// builds, anything else is tried with micropip (pure-Python packages from PyPI). Plots don't open a window (Agg).
// An endless loop is stopped by the timeout, which throws the warm worker away.
const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';

const PY_WORKER = `
  importScripts('${PYODIDE}pyodide.js');
  const ready = loadPyodide({ indexURL: '${PYODIDE}' }).then(async (p) => {
    p.runPython('import os\\nos.environ["MPLBACKEND"] = "Agg"');
    return p;
  });
  onmessage = async (e) => {
    const { files, entry, id } = e.data; let out = ''; const installed = [];
    try {
      const p = await ready;
      p.setStdout({ batched: (s) => { out += s + '\\n'; } });
      p.setStderr({ batched: (s) => { out += s + '\\n'; } });
      for (const f of files) { const parts = f.name.split('/'); for (let i = 1; i < parts.length; i++) { try { p.FS.mkdir(parts.slice(0, i).join('/')); } catch (x) {} } p.FS.writeFile(f.name, f.content); }
      p.runPython('import sys\\nif "." not in sys.path: sys.path.insert(0, ".")');
      // Packages the code imports (numpy, pandas, sklearn...): Pyodide's builds first.
      const all = files.filter((f) => /\\.py$/.test(f.name)).map((f) => f.content).join('\\n');
      await p.loadPackagesFromImports(all, { messageCallback: (m) => { if (/^Loaded /.test(m)) installed.push(m.replace(/^Loaded /, '')); } });
      // Anything still missing: micropip (pure-Python wheels from PyPI), then run again. Up to 3 tries.
      for (let tries = 0; ; tries++) {
        try {
          // Fresh copies of the project's own modules each run, so edits to other files take effect.
          p.runPython('import sys\\nfor _m in [m for m, v in list(sys.modules.items()) if getattr(v, "__file__", "") and str(getattr(v, "__file__", "")).startswith("/home/pyodide/")]: del sys.modules[_m]');
          await p.runPythonAsync(files.find((f) => f.name === entry).content);
          break;
        } catch (err) {
          const m = String(err.message || err).match(/No module named '([\\w.]+)'/);
          if (!m || tries >= 2) throw err;
          const name = m[1].split('.')[0];
          const pipName = { sklearn: 'scikit-learn', cv2: 'opencv-python', PIL: 'pillow', bs4: 'beautifulsoup4', yaml: 'pyyaml' }[name] || name;
          await p.loadPackage('micropip');
          const micropip = p.pyimport('micropip');
          await micropip.install(pipName);
          installed.push(pipName);
          out = '';
        }
      }
      postMessage({ id, out, installed });
    } catch (err) {
      const msg = String(err.message || err);
      const missing = msg.match(/No module named '([\\w.]+)'/);
      postMessage({ id, out, installed, error: missing ? \`The package "\${missing[1]}" can't be installed on the phone (it needs native code Pyodide doesn't have). Try it on a computer, or use a package from Pyodide's list.\` : msg.split('\\n').slice(-4).join('\\n') });
    }
  };`;

let py = null; // { worker, warm }
let seq = 0;
function pyWorker() {
  if (!py) py = { worker: new Worker(URL.createObjectURL(new Blob([PY_WORKER], { type: 'text/javascript' }))), warm: false };
  return py;
}
function dropPy() { try { py?.worker.terminate(); } catch { /* gone */ } py = null; }

function runPython(files, entry) {
  const w = pyWorker(); const id = ++seq;
  // The first run downloads Python plus the packages (numpy + pandas + scikit-learn is a few minutes on mobile data).
  const limit = w.warm ? 90000 : 240000;
  return new Promise((resolve) => {
    const t = setTimeout(() => { dropPy(); resolve({ error: w.warm ? 'Timed out: an endless loop, or a very slow step?' : 'Timed out downloading Python and its packages. Check your connection and run again (it carries on where it got to).' }); }, limit);
    const onMsg = (e) => { if (e.data?.id !== id) return; clearTimeout(t); w.worker.removeEventListener('message', onMsg); w.warm = true; resolve({ ...e.data, entry }); };
    w.worker.addEventListener('message', onMsg);
    w.worker.onerror = (e) => { clearTimeout(t); dropPy(); resolve({ error: `Python could not start: ${e.message || 'check your internet connection (it is downloaded the first time).'}` }); };
    w.worker.postMessage({ files, entry, id });
  });
}

export const pythonIsWarm = () => !!py?.warm;

export function runProject({ lang, files, main }) {
  const isPy = /^py/.test(lang || 'python');
  const entry = main || (isPy ? (files.find((f) => /main\.py$/.test(f.name)) || files.find((f) => /\.py$/.test(f.name)))?.name : (files.find((f) => /(main|index)\.js$/.test(f.name)) || files.find((f) => /\.js$/.test(f.name)))?.name);
  if (!entry) return Promise.resolve({ error: `No ${isPy ? '.py' : '.js'} file to run.` });
  if (isPy) return runPython(files, entry);
  const src = `
    onmessage = (e) => {
      const { files, entry } = e.data; let out = '';
      const log = (...a) => { out += a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') + '\\n'; };
      const console = { log, error: log, warn: log, info: log };
      try { const code = files.filter((f) => f.name !== entry && /\\.js$/.test(f.name)).map((f) => f.content).join('\\n') + '\\n' + files.find((f) => f.name === entry).content; new Function('console', code)(console); postMessage({ out }); }
      catch (err) { postMessage({ out, error: String(err.message || err) }); }
    };`;
  return new Promise((resolve) => {
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    const t = setTimeout(() => { w.terminate(); resolve({ error: 'Timed out: an endless loop?' }); }, 6000);
    w.onmessage = (e) => { clearTimeout(t); w.terminate(); resolve({ ...e.data, entry }); };
    w.onerror = (e) => { clearTimeout(t); w.terminate(); resolve({ error: e.message }); };
    w.postMessage({ files, entry });
  });
}
