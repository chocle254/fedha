// Small, safe Markdown view for AI answers and notes: headings, bullets, numbered lists, **bold**, `code`,
// fenced code blocks. Builds React elements (no innerHTML).
function inline(text, key) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    out.push(t.startsWith('**') ? <b key={`${key}-${i++}`}>{t.slice(2, -2)}</b> : <code key={`${key}-${i++}`} className="md-code">{t.slice(1, -1)}</code>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Md({ text, style }) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const blocks = [];
  let list = null, code = null;
  const flush = () => { if (list) { blocks.push(list); list = null; } };
  lines.forEach((raw, n) => {
    if (code) {
      if (raw.trim().startsWith('```')) { blocks.push({ t: 'code', body: code.join('\n') }); code = null; } else code.push(raw);
      return;
    }
    if (raw.trim().startsWith('```')) { flush(); code = []; return; }
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,4})\s+(.*)/);
    const li = line.match(/^\s*[-*•]\s+(.*)/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (h) { flush(); blocks.push({ t: 'h', lvl: h[1].length, body: h[2], n }); }
    else if (li || ol) {
      const kind = ol ? 'ol' : 'ul';
      if (!list || list.t !== kind) { flush(); list = { t: kind, items: [], n }; }
      list.items.push((li || ol)[1]);
    } else if (!line.trim()) flush();
    else { flush(); blocks.push({ t: 'p', body: line, n }); }
  });
  flush();
  if (code) blocks.push({ t: 'code', body: code.join('\n') });
  return (
    <div className="md" style={{ fontSize: 13, lineHeight: 1.65, ...style }}>
      {blocks.map((b, i) => {
        if (b.t === 'h') return <div key={i} style={{ fontWeight: 800, fontSize: b.lvl <= 2 ? 14.5 : 13.5, margin: '12px 0 4px' }}>{inline(b.body, i)}</div>;
        if (b.t === 'code') return <pre key={i} className="md-pre">{b.body}</pre>;
        if (b.t === 'p') return <p key={i} style={{ margin: '4px 0' }}>{inline(b.body, i)}</p>;
        const Tag = b.t;
        return <Tag key={i} style={{ margin: '4px 0', paddingLeft: 20 }}>{b.items.map((it, j) => <li key={j} style={{ margin: '2px 0' }}>{inline(it, `${i}-${j}`)}</li>)}</Tag>;
      })}
    </div>
  );
}
