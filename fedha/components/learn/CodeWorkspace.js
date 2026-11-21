import { useEffect, useRef, useState } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection, Decoration } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo, insertNewlineAndIndent } from '@codemirror/commands';
import { syntaxHighlighting, HighlightStyle, indentOnInput, bracketMatching, indentUnit } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap, autocompletion, acceptCompletion, closeCompletion, moveCompletionSelection, startCompletion } from '@codemirror/autocomplete';
import { tooltips } from '@codemirror/view';
import { pythonLibrarySource, filesSource, snippetsSource } from './code-completions';
import { tags as t } from '@lezer/highlight';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';

// The editor is CodeMirror 6: real syntax colours, undo/redo, auto-indent and bracket pairing, built to behave
// with phone keyboards. The text is always drawn by the editor itself, so it can never go invisible.
const LANGS = { python, javascript: () => javascript({ jsx: true, typescript: true }), css, html, json, md: markdown, htm: html };

const HL = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: '#6B7280', fontStyle: 'italic' },
  { tag: [t.string, t.special(t.string), t.regexp], color: '#E5B77A' },
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword, t.definitionKeyword], color: '#C792EA' },
  { tag: [t.bool, t.null, t.atom], color: '#89DDFF' },
  { tag: [t.number, t.integer, t.float], color: '#F78C6C' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName))], color: '#82AAFF' },
  { tag: [t.className, t.typeName, t.tagName], color: '#FFCB6B' },
  { tag: [t.propertyName, t.attributeName], color: '#9ECBFF' },
  { tag: [t.operator, t.punctuation, t.bracket], color: '#89DDFF' },
  { tag: [t.variableName, t.name], color: '#D6DEEB' },
]);

const THEME = EditorView.theme({
  '&': { backgroundColor: '#0d1117', color: '#D6DEEB', fontSize: '14px', maxHeight: '55vh', minHeight: '240px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: '21px', overflow: 'auto', WebkitOverflowScrolling: 'touch' },
  '.cm-content': { caretColor: '#ffffff', padding: '10px 0 40px' },
  '.cm-line': { padding: '0 12px 0 6px' },
  '.cm-gutters': { backgroundColor: '#0d1117', color: '#484f58', border: 'none', minWidth: '34px' },
  '.cm-activeLine': { backgroundColor: 'rgba(88,166,255,.07)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#8b949e' },
  '.cm-cursor': { borderLeftColor: '#ffffff', borderLeftWidth: '2px' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'rgba(88,166,255,.35) !important' },
  '.cm-matchingBracket': { backgroundColor: 'rgba(63,185,80,.25)', outline: 'none' },
  '.cm-tooltip': { backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,.5)' },
  '.cm-tooltip-autocomplete > ul': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '13px', maxHeight: '34vh', maxWidth: '86vw' },
  '.cm-tooltip-autocomplete > ul > li': { padding: '7px 10px', color: '#c9d1d9' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: '#1f6feb', color: '#ffffff' },
  '.cm-completionDetail': { color: '#7d8590', marginLeft: '10px', fontStyle: 'normal', fontSize: '11px' },
  '.cm-completionMatchedText': { textDecoration: 'none', color: '#58a6ff', fontWeight: '700' },
  '.review-line': { backgroundColor: 'rgba(227,179,65,.16)', boxShadow: 'inset 3px 0 0 #e3b341' },
}, { dark: true });

function languageFor(name = '') {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'py') return 'python';
  if (['js', 'jsx', 'ts', 'tsx', 'mjs'].includes(ext)) return 'javascript';
  if (ext === 'css') return 'css';
  if (['html', 'htm', 'json', 'md'].includes(ext)) return ext;
  return ext || 'text';
}

// One editor per open file (the parent keys it by file, so switching tabs makes a fresh one).
function Editor({ value, language, onChange, fixLines, viewRef, suggest, others }) {
  const host = useRef(null);
  const onChangeRef = useRef(onChange);
  const marks = useRef(new Compartment());
  const sugg = useRef(new Compartment());
  const othersRef = useRef(others);
  othersRef.current = others;
  onChangeRef.current = onChange;

  const marksFor = (lines) => EditorView.decorations.of((view) => {
    const d = [];
    for (const n of lines) if (n >= 1 && n <= view.state.doc.lines) d.push(Decoration.line({ class: 'review-line' }).range(view.state.doc.line(n).from));
    return Decoration.set(d, true);
  });

  const suggestExt = (on) => { if (!on) return [];
    // Built once: CodeMirror tells sources apart by identity, so new functions on every call would never finish.
    const sources = [{ autocomplete: filesSource(() => othersRef.current || []) }, { autocomplete: snippetsSource(language) }, ...(language === 'python' ? [{ autocomplete: pythonLibrarySource }] : [])];
    return [
    autocompletion({ defaultKeymap: false, maxRenderedOptions: 8, activateOnTypingDelay: 60 }),
    tooltips({ parent: document.body }),
    EditorState.languageData.of(() => sources),
    keymap.of([{ key: 'Tab', run: acceptCompletion }, { key: 'Escape', run: closeCompletion }, { key: 'ArrowDown', run: moveCompletionSelection(true) }, { key: 'ArrowUp', run: moveCompletionSelection(false) }, { key: 'Ctrl-Space', run: startCompletion }]),
  ]; };

  useEffect(() => {
    const lang = LANGS[language];
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value || '',
        extensions: [
          lineNumbers(), history(), drawSelection(), highlightActiveLine(), indentOnInput(), bracketMatching(), closeBrackets(),
          indentUnit.of('    '), EditorState.tabSize.of(4),
          syntaxHighlighting(HL), THEME,
          lang ? lang() : [],
          marks.current.of(marksFor(fixLines)),
          sugg.current.of(suggestExt(suggest)),
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab, { key: 'Enter', run: insertNewlineAndIndent }]),
          EditorView.contentAttributes.of({ autocapitalize: 'off', autocorrect: 'off', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Code editor' }),
          EditorView.updateListener.of((u) => { if (u.docChanged) onChangeRef.current(u.state.doc.toString()); }),
        ],
      }),
    });
    viewRef.current = view;
    return () => { view.destroy(); viewRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Byte's review marks the lines he flagged.
  useEffect(() => { viewRef.current?.dispatch({ effects: marks.current.reconfigure(marksFor(fixLines)) }); }, [fixLines.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { viewRef.current?.dispatch({ effects: sugg.current.reconfigure(suggestExt(suggest)) }); }, [suggest]); // eslint-disable-line react-hooks/exhaustive-deps
  // If the file changed from outside the editor, show it.
  useEffect(() => {
    const v = viewRef.current;
    if (v && (value || '') !== v.state.doc.toString()) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value || '' } });
  }, [value]);
  return <div ref={host} className="dev-cm" />;
}

// Phone keyboards bury the symbols code needs, so they sit one tap away above the editor.
const KEYS = ['⇥', '(', ')', '[', ']', '{', '}', '"', "'", ':', '=', '.', ',', '_', '#', '/', '\\', '<', '>', ';', '!', '+', '-', '*', '&', '|'];

const iconFor = (name) => {
  const ext = name.split('.').pop()?.toLowerCase();
  return ({ py: '🐍', js: '🟨', jsx: '⚛️', ts: '🔷', tsx: '⚛️', css: '🎨', html: '🌐', json: '📋', md: '📝' })[ext] || '📄';
};

export default function CodeWorkspace({ files, file, setFile, setCode, reviewFixes = [], addFile, removeFile, maxFiles }) {
  const viewRef = useRef(null);
  const [suggest, setSuggest] = useState(true);
  useEffect(() => { try { if (localStorage.getItem('fedha_code_suggest') === '0') setSuggest(false); } catch { /* private mode */ } }, []);
  const toggleSuggest = () => { const next = !suggest; setSuggest(next); try { localStorage.setItem('fedha_code_suggest', next ? '1' : '0'); } catch { /* ignore */ } };
  const active = files[file];
  const language = languageFor(active?.name || '');
  const lineCount = (active?.content || '').split('\n').length;
  const fixLines = reviewFixes.filter((x) => active && x.file === active.name && x.line).map((x) => x.line);
  const press = (k) => {
    const v = viewRef.current; if (!v) return;
    if (k === '⇥') { v.dispatch(v.state.replaceSelection('    '), { scrollIntoView: true }); }
    else { const r = v.state.selection.main; v.dispatch({ changes: { from: r.from, to: r.to, insert: k }, selection: { anchor: r.from + k.length }, scrollIntoView: true }); }
    v.focus();
  };
  const keep = (e) => e.preventDefault(); // tapping a key must not close the phone keyboard
  return (
    <>
    <div className="dev-workspace">
      <div className="dev-topbar">
        <div className="dev-brand"><span className="dev-brand-dot" /> WORKSPACE <span className="dev-divider">/</span> {language.toUpperCase()}</div>
        <div className="dev-top-actions">
          <button type="button" className={'dev-focus dev-auto ' + (suggest ? 'on' : '')} onMouseDown={keep} onClick={toggleSuggest} aria-pressed={suggest} title="Code suggestions">✦ Auto</button>
          <button type="button" className="dev-focus" onMouseDown={keep} onClick={() => viewRef.current && undo(viewRef.current)} aria-label="Undo">↶</button>
          <button type="button" className="dev-focus" onMouseDown={keep} onClick={() => viewRef.current && redo(viewRef.current)} aria-label="Redo">↷</button>
        </div>
      </div>
      <div className="dev-filebar">
        <div className="dev-filetabs">
          {files.map((f, i) => <div className={'dev-tab ' + (i === file ? 'active' : '')} key={f.name + i}><button type="button" className="dev-tab-open" onClick={() => setFile(i)} title={f.name}><span>{iconFor(f.name)}</span>{f.name}</button>{files.length > 1 && <button type="button" className="dev-tab-close" onClick={() => removeFile?.(i)} aria-label={'Remove ' + f.name} title="Remove file">×</button>}</div>)}
          {files.length < maxFiles && <button type="button" className="dev-addfile" onClick={addFile} title="Add file">＋</button>}
        </div>
      </div>
      <div className="dev-keys" role="toolbar" aria-label="Code symbols">
        {KEYS.map((k) => <button type="button" key={k} onMouseDown={keep} onTouchStart={keep} onClick={() => press(k)}>{k}</button>)}
      </div>
      {active && <div className="dev-editor-shell"><Editor key={file + ':' + active.name} value={active.content || ''} language={language} onChange={setCode} fixLines={fixLines} viewRef={viewRef} suggest={suggest} others={files.filter((_, i) => i !== file)} /></div>}
      <div className="dev-statusbar"><span>{language}</span><span>UTF-8</span><span>Spaces: 4</span><span className="dev-statusbar-right">Ln {lineCount} · {active?.content?.length || 0} chars</span></div>
    </div>
    <style jsx global>{`
      .dev-workspace { overflow: hidden; border: 1px solid #252b36; border-radius: 12px; background: #0d1117; color: #c9d1d9; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      .dev-topbar { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #111720; border-bottom: 1px solid #252b36; font-size: 10px; letter-spacing: 1.2px; }
      .dev-brand { color: #8b949e; font-weight: 800; display: flex; align-items: center; gap: 7px; }
      .dev-brand-dot { width: 7px; height: 7px; border-radius: 50%; background: #3fb950; box-shadow: 0 0 8px #3fb95066; }
      .dev-divider { color: #484f58; }
      .dev-top-actions { display: flex; gap: 6px; align-items: center; }
      .dev-focus { border: 1px solid #34465a; border-radius: 6px; background: #172638; color: #c9e1ff; min-width: 34px; height: 28px; font: 15px ui-monospace, monospace; cursor: pointer; }
      .dev-auto { width: auto; padding: 0 9px; font-size: 11px !important; color: #7d8590; } .dev-auto.on { color: #3fb950; border-color: #2b6a3a; }
      .dev-filebar { background: #0d1117; border-bottom: 1px solid #252b36; }
      .dev-filetabs { display: flex; align-items: center; overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
      .dev-filetabs::-webkit-scrollbar { display: none; }
      .dev-tab { display: flex; align-items: center; flex: 0 0 auto; background: #111720; border-right: 1px solid #252b36; }
      .dev-tab.active { background: #0d1117; box-shadow: inset 0 2px 0 #58a6ff; }
      .dev-filetabs .dev-tab-open { border: 0; background: transparent; color: #8b949e; padding: 11px 6px 11px 12px; font: 12px ui-monospace, monospace; display: flex; gap: 7px; align-items: center; white-space: nowrap; cursor: pointer; }
      .dev-tab.active .dev-tab-open { color: #e6edf3; }
      .dev-filetabs .dev-tab-close { border: 0; background: transparent; color: #7d8590; padding: 8px 10px; font: 18px/1 ui-monospace, monospace; cursor: pointer; }
      .dev-filetabs .dev-tab-close:hover { color: #f87171; }
      .dev-filetabs .dev-addfile { flex: 0 0 auto; border: 0; background: transparent; color: #58a6ff; font-size: 18px; padding: 7px 14px; cursor: pointer; }
      .dev-keys { display: flex; gap: 5px; overflow-x: auto; padding: 6px 8px; background: #111720; border-bottom: 1px solid #252b36; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
      .dev-keys::-webkit-scrollbar { display: none; }
      .dev-keys button { flex: 0 0 auto; min-width: 36px; height: 34px; padding: 0 8px; border: 1px solid #2d3748; border-radius: 8px; background: #172030; color: #c9e1ff; font: 600 15px ui-monospace, monospace; cursor: pointer; touch-action: manipulation; }
      .dev-keys button:active { background: #24405f; }
      .dev-editor-shell { background: #0d1117; }
      .dev-cm .cm-editor { border: 0; }
      .dev-statusbar { display: flex; gap: 12px; align-items: center; padding: 5px 10px; background: #17202b; border-top: 1px solid #252b36; color: #8b949e; font: 10px ui-monospace, monospace; }
      .dev-statusbar-right { margin-left: auto; }
      @media (max-width: 480px) { .dev-workspace { border-radius: 10px; } .dev-statusbar span:nth-child(2), .dev-statusbar span:nth-child(3) { display: none; } .dev-cm .cm-editor { max-height: 45vh; min-height: 200px; } }
    `}</style>
    </>
  );
}
