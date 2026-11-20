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

export default function CodeWorkspace({ files, file, setFile, setCode, onKey, reviewFixes = [], addFile, maxFiles, lang }) {
  const editorRef = useRef(null), highlightRef = useRef(null);
  const active = files[file];
  const language = languageFor(active?.name || '');
  const lineCount = (active?.content || '').split('\n').length;
  const syncScroll = () => { if (highlightRef.current && editorRef.current) { highlightRef.current.scrollTop = editorRef.current.scrollTop; highlightRef.current.scrollLeft = editorRef.current.scrollLeft; } };
  return (
    <div className="dev-workspace">
      <div className="dev-topbar">
        <div className="dev-brand"><span className="dev-brand-dot" /> WORKSPACE <span className="dev-divider">/</span> {language.toUpperCase()}</div>
        <div className="dev-top-actions"><span className="dev-status">● READY</span><span className="dev-mobile-lang">{language}</span></div>
      </div>
      <div className="dev-filebar">
        <div className="dev-filetabs">
          {files.map((f, i) => <button key={f.name + i} className={i === file ? 'active' : ''} onClick={() => setFile(i)} title={f.name}><span>{iconFor(f.name)}</span>{f.name}</button>)}
          {files.length < maxFiles && <button className="dev-addfile" onClick={addFile} title="Add file">＋</button>}
        </div>
        <div className="dev-filemeta">{active?.name || 'untitled'} <span>· {language}</span></div>
      </div>
      {active && <div className="dev-editor-shell">
        <div className="dev-line-numbers" aria-hidden="true">{Array.from({ length: Math.max(lineCount, 12) }, (_, i) => <div key={i} className={reviewFixes.some((x) => x.file === active.name && x.line === i + 1) ? 'review-line' : ''}>{i + 1}</div>)}</div>
        <div className="dev-editor-layer">
          <div className="dev-highlight-wrap" ref={highlightRef}><Highlight content={active.content || ''} language={language} /></div>
          <textarea ref={editorRef} value={active.content || ''} onChange={(e) => setCode(e.target.value)} onKeyDown={onKey} onScroll={syncScroll} spellCheck={false} autoCapitalize="off" autoCorrect="off" aria-label={'Code editor for ' + active.name} />
        </div>
      </div>}
      <div className="dev-statusbar"><span>{language}</span><span>UTF-8</span><span>Spaces: 4</span><span className="dev-statusbar-right">Ln {lineCount} · {active?.content?.length || 0} chars</span></div>
    </div>
  );
}
