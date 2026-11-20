import { useRef } from 'react';

const COLORS = {
  comment: '#6B7280', string: '#E5B77A', keyword: '#C792EA',
  boolean: '#89DDFF', number: '#F78C6C', function: '#82AAFF',
  class: '#FFCB6B', variable: '#D6DEEB', punctuation: '#89DDFF',
};

const PY = new Set('and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' '));
const JS = new Set('async await break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new return super switch this throw try typeof var void while with yield'.split(' '));
const CSS = new Set('important inherit initial unset auto none block flex grid inline inline-block absolute relative fixed sticky hidden solid dashed dotted transparent'.split(' '));

function languageFor(name = '') {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'py') return 'python';
  if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) return 'javascript';
  if (ext === 'css') return 'css';
  if (['html', 'htm'].includes(ext) || ['json', 'md'].includes(ext)) return ext;
  return ext || 'text';
}

function tokens(line, language) {
  if (language === 'text') return [{ text: line }];
  const rx = /(#[^\n]*|\/\/[^\n]*|\/\*[\s\S]*?\*\/|(?:'''[\s\S]*?'''|"""[\s\S]*?"""|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*'|\x60(?:\\.|[^\x60\\])*\x60)|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b)/g;
  const out = []; let last = 0, m;
  while ((m = rx.exec(line))) {
    if (m.index > last) out.push({ text: line.slice(last, m.index) });
    const t = m[0]; let color;
    if (t.startsWith('#') || t.startsWith('//') || t.startsWith('/*')) color = COLORS.comment;
    else if (/^['"`]/.test(t)) color = COLORS.string;
    else if (/^\d/.test(t)) color = COLORS.number;
    else if (/^(true|false|True|False|null|None|undefined|NaN)$/.test(t)) color = COLORS.boolean;
    else if ((language === 'python' ? PY : language === 'css' ? CSS : JS).has(t)) color = COLORS.keyword;
    else if (/^[A-Z]/.test(t)) color = COLORS.class;
    else if (/(?:def|function)\s*$/.test(line.slice(Math.max(0, m.index - 12), m.index)) || /\s$/.test(line.slice(m.index + t.length, m.index + t.length + 1)) && line.slice(m.index + t.length).trimStart().startsWith('(')) color = COLORS.function;
    else if (language === 'css' && line.includes(':')) color = COLORS.boolean;
    out.push({ text: t, color });
    last = m.index + t.length;
  }
  if (last < line.length) out.push({ text: line.slice(last) });
  return out;
}

function Highlight({ content, language }) {
  return <pre className="dev-highlight" aria-hidden="true">{content.split('\n').map((line, i) => <span className="dev-hl-line" key={i}>{tokens(line, language).map((t, k) => <span key={k} style={{ color: t.color || COLORS.variable }}>{t.text}</span>)}{line.length === 0 ? ' ' : ''}{'\n'}</span>)}</pre>;
}

const iconFor = (name) => {
  const ext = name.split('.').pop()?.toLowerCase();
  return ({ py: '🐍', js: '🟨', jsx: '⚛️', ts: '🔷', tsx: '⚛️', css: '🎨', html: '🌐', json: '📋', md: '📝' })[ext] || '📄';
};

export default function CodeWorkspace({ files, file, setFile, setCode, onKey, reviewFixes = [], addFile, removeFile, maxFiles, lang }) {
  const editorRef = useRef(null), highlightRef = useRef(null);
  const active = files[file];
  const language = languageFor(active?.name || '');
  const lineCount = (active?.content || '').split('\n').length;
  const syncScroll = () => { if (highlightRef.current && editorRef.current) { highlightRef.current.scrollTop = editorRef.current.scrollTop; highlightRef.current.scrollLeft = editorRef.current.scrollLeft; } };
  return (
    <>
    <div className="dev-workspace">
      <div className="dev-topbar">
        <div className="dev-brand"><span className="dev-brand-dot" /> WORKSPACE <span className="dev-divider">/</span> {language.toUpperCase()}</div>
        <div className="dev-top-actions"><span className="dev-status">● READY</span><span className="dev-mobile-lang">{language}</span><button type="button" className="dev-focus" onClick={() => editorRef.current?.focus()}>⌨ Type</button></div>
      </div>
      <div className="dev-filebar">
        <div className="dev-filetabs">
          {files.map((f, i) => <div className={'dev-tab ' + (i === file ? 'active' : '')} key={f.name + i}><button type="button" className="dev-tab-open" onClick={() => setFile(i)} title={f.name}><span>{iconFor(f.name)}</span>{f.name}</button>{files.length > 1 && <button type="button" className="dev-tab-close" onClick={() => removeFile?.(i)} aria-label={'Remove ' + f.name} title="Remove file">×</button>}</div>)}
          {files.length < maxFiles && <button className="dev-addfile" onClick={addFile} title="Add file">＋</button>}
        </div>
        <div className="dev-tree" aria-label="Project files"><div className="dev-tree-title">EXPLORER <span>PROJECT</span></div>{files.map((f, i) => { const parts = f.name.split('/').filter(Boolean); const depth = Math.max(0, parts.length - 1); return <button type="button" key={'tree-' + f.name + i} className={'dev-tree-file ' + (i === file ? 'active' : '')} style={{ paddingLeft: 10 + depth * 14 }} onClick={() => setFile(i)}><span>{depth ? '↳' : '›'}</span>{parts[parts.length - 1]}<small>{depth ? parts.slice(0, -1).join('/') : ''}</small></button>; })}</div>
        <div className="dev-filemeta">{active?.name || 'untitled'} <span>· {language}</span></div>
      </div>
      {active && <div className="dev-editor-shell">
        <div className="dev-line-numbers" aria-hidden="true">{Array.from({ length: Math.max(lineCount, 12) }, (_, i) => <div key={i} className={reviewFixes.some((x) => x.file === active.name && x.line === i + 1) ? 'review-line' : ''}>{i + 1}</div>)}</div>
        <div className="dev-editor-layer">
          <div className="dev-highlight-wrap" ref={highlightRef}><Highlight content={active.content || ''} language={language} /></div>
          <textarea ref={editorRef} value={active.content || ''} onChange={(e) => setCode(e.target.value)} onKeyDown={onKey} onScroll={syncScroll} spellCheck={false} autoCapitalize="off" autoCorrect="off" autoComplete="off" inputMode="text" enterKeyHint="enter" aria-label={'Code editor for ' + active.name} />
        </div>
      </div>}
      <div className="dev-statusbar"><span>{language}</span><span>UTF-8</span><span>Spaces: 4</span><span className="dev-statusbar-right">Ln {lineCount} · {active?.content?.length || 0} chars</span></div>
    </div>
    <style jsx global>{`\n      .dev-workspace { overflow: hidden; border: 1px solid #252b36; border-radius: 12px; background: #0d1117; color: #c9d1d9; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }\n      .dev-topbar { display:flex; align-items:center; justify-content:space-between; padding:9px 12px; background:#111720; border-bottom:1px solid #252b36; font-size:10px; letter-spacing:1.2px; }\n      .dev-brand { color:#8b949e; font-weight:800; display:flex; align-items:center; gap:7px; } .dev-brand-dot { width:7px;height:7px;border-radius:50%;background:#3fb950;box-shadow:0 0 8px #3fb95066; } .dev-divider { color:#484f58; } .dev-top-actions { display:flex;gap:10px;align-items:center; } .dev-status { color:#3fb950;font-size:9px; } .dev-mobile-lang { color:#7d8590;letter-spacing:0; text-transform:none; }\n      .dev-filebar { background:#0d1117; border-bottom:1px solid #252b36; } .dev-filetabs { display:flex; align-items:center; overflow-x:auto; scrollbar-width:thin; } .dev-tab { display:flex;align-items:center;background:#111720;border-right:1px solid #252b36; } .dev-tab.active { background:#0d1117;border-top:2px solid #58a6ff; } .dev-filetabs .dev-tab-open { border:0;background:transparent;color:#8b949e;padding:10px 8px 10px 12px;font:11px ui-monospace,monospace;display:flex;gap:7px;align-items:center;white-space:nowrap;cursor:pointer; } .dev-tab.active .dev-tab-open { color:#e6edf3;padding-top:8px;padding-bottom:10px; } .dev-filetabs .dev-tab-close { border:0;background:transparent;color:#7d8590;padding:5px 8px;font:17px/1 ui-monospace,monospace;cursor:pointer; } .dev-filetabs .dev-tab-close:hover { color:#f87171; } .dev-filetabs .dev-addfile { color:#58a6ff;font-size:16px;padding:7px 12px; } .dev-tree { display:flex;align-items:center;gap:4px;overflow-x:auto;padding:6px 8px;border-top:1px solid #1c2530;border-bottom:1px solid #252b36;background:#0b1017;scrollbar-width:thin; } .dev-tree-title { flex:0 0 auto;color:#7d8590;font-size:9px;font-weight:800;letter-spacing:.8px;padding:0 8px 0 2px; } .dev-tree-title span { color:#484f58;font-weight:500;margin-left:5px; } .dev-tree-file { flex:0 0 auto;border:0;border-radius:5px;background:transparent;color:#8b949e;padding:5px 7px;font:10px ui-monospace,monospace;white-space:nowrap;cursor:pointer; } .dev-tree-file.active { background:#172638;color:#c9e1ff; } .dev-tree-file span { color:#58a6ff;margin-right:5px; } .dev-tree-file small { color:#586474;margin-left:5px; } .dev-focus { border:1px solid #34465a;border-radius:6px;background:#172638;color:#c9e1ff;padding:5px 8px;font:10px ui-monospace,monospace;cursor:pointer; } .dev-filemeta { padding:6px 11px;font-size:10px;color:#8b949e;background:#0d1117; } .dev-filemeta span { color:#484f58; }\n      .dev-editor-shell { display:flex; min-height:240px; max-height:55vh; background:#0d1117; overflow:hidden; } .dev-line-numbers { padding:10px 8px 10px 10px; text-align:right; color:#484f58; font:12px/20px ui-monospace,monospace; background:#0d1117; user-select:none; min-width:34px; } .dev-line-numbers .review-line { color:#e3b341; font-weight:700; } .dev-editor-layer { position:relative; flex:1; min-width:0; overflow:hidden; } .dev-highlight-wrap { position:absolute;inset:0;overflow:auto;pointer-events:none;scrollbar-width:none; } .dev-highlight-wrap::-webkit-scrollbar { display:none; } .dev-highlight { margin:0; padding:10px 12px; min-height:220px; width:max-content; min-width:100%; box-sizing:border-box; white-space:pre; font:12px/20px ui-monospace,SFMono-Regular,Menlo,monospace; tab-size:4; } .dev-hl-line { display:block; min-height:20px; } .dev-editor-layer textarea { position:absolute;inset:0;z-index:2;pointer-events:auto;touch-action:pan-x pan-y;width:100%;height:100%;min-height:240px;resize:vertical;box-sizing:border-box;margin:0;padding:10px 12px;border:0;outline:0;background:transparent;color:transparent;caret-color:#e6edf3;font:12px/20px ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre;overflow:auto;tab-size:4;-webkit-text-fill-color:transparent; } .dev-editor-layer textarea::selection { background:rgba(88,166,255,.35);-webkit-text-fill-color:transparent; } .dev-statusbar { display:flex;gap:12px;align-items:center;padding:5px 10px;background:#17202b;border-top:1px solid #252b36;color:#8b949e;font:9px ui-monospace,monospace; } .dev-statusbar-right { margin-left:auto; }\n      @media(max-width:480px) { .dev-filetabs .dev-tab-open { padding:9px 7px 9px 9px;font-size:10px; } .dev-filetabs .dev-tab-close { padding:5px 6px; } .dev-editor-shell { min-height:210px;max-height:48vh; } .dev-highlight { min-height:190px;font-size:11.5px; } .dev-editor-layer textarea { min-height:210px;font-size:11.5px; } .dev-line-numbers { font-size:11.5px; } }\n    `}</style>
    </>
  );
}
