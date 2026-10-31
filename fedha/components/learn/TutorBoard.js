import { motion } from 'framer-motion';

// Professor Byte's board: what he points at while he talks. One board per scene, drawn with a little life:
// charts plot themselves, steps arrive one by one, flows connect with arrows, stories unroll like a scroll.
// Board kinds (from pages/api/study.js, type 'stage'): chart, steps, code, big, compare, flow, story.
const ink = { title: { fontWeight: 800, fontSize: 12.5, marginBottom: 6, color: '#E9D8A6', letterSpacing: 0.3 } };
const rise = (i) => ({ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.25 + i * 0.35 } });

function Chart({ b }) {
  const pts = (b.points || []).slice(0, 14);
  if (!pts.length) return null;
  const W = 260, H = 140, L = 30, B = 22, T = 8, R = 8;
  const numericX = pts.every((p) => typeof p[0] === 'number');
  const ys = pts.map((p) => Number(p[1]) || 0);
  const yMin = Math.min(0, ...ys), yMax = Math.max(...ys, yMin + 1);
  const xs = numericX ? pts.map((p) => p[0]) : pts.map((_, i) => i);
  const xMin = Math.min(...xs), xMax = Math.max(...xs, xMin + 1);
  const X = (v) => L + ((v - xMin) / (xMax - xMin || 1)) * (W - L - R);
  const Y = (v) => T + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - T - B);
  const fmt = (v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : Math.round(v * 100) / 100);
  const bar = b.kind === 'bar';
  const bw = Math.max(6, ((W - L - R) / pts.length) * 0.6);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${X(xs[i]).toFixed(1)} ${Y(ys[i]).toFixed(1)}`).join(' ');
  return (
    <div>
      {b.title && <div style={ink.title}>📈 {b.title}</div>}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {[0, 0.5, 1].map((f) => { const v = yMin + f * (yMax - yMin); return <g key={f}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="rgba(255,255,255,.08)" /><text x={L - 4} y={Y(v) + 3} fontSize="8" fill="rgba(255,255,255,.5)" textAnchor="end">{fmt(v)}</text></g>; })}
        <line x1={L} x2={L} y1={T} y2={H - B} stroke="rgba(255,255,255,.25)" />
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="rgba(255,255,255,.25)" />
        {bar ? pts.map((p, i) => {
          const x = bar && !numericX ? L + ((i + 0.5) / pts.length) * (W - L - R) : X(xs[i]);
          return <motion.rect key={i} x={x - bw / 2} width={bw} rx="2" fill="#34D399" initial={{ y: Y(yMin), height: 0 }} animate={{ y: Y(ys[i]), height: Math.max(0, Y(yMin) - Y(ys[i])) }} transition={{ delay: 0.2 + i * 0.12, type: 'spring', stiffness: 120, damping: 14 }} />;
        }) : <>
          <motion.path d={path} fill="none" stroke="#34D399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, ease: 'easeInOut', delay: 0.2 }} />
          {pts.map((p, i) => <motion.circle key={i} cx={X(xs[i])} cy={Y(ys[i])} r="3" fill="#0B0F14" stroke="#34D399" strokeWidth="2" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2 + (i / pts.length) * 1.4 }} />)}
        </>}
        {pts.map((p, i) => (pts.length <= 8 || i % 2 === 0) && <text key={i} x={bar && !numericX ? L + ((i + 0.5) / pts.length) * (W - L - R) : X(xs[i])} y={H - B + 11} fontSize="8" fill="rgba(255,255,255,.6)" textAnchor="middle">{String(p[0]).slice(0, 8)}</text>)}
        {b.x && <text x={(L + W) / 2} y={H - 1} fontSize="8" fill="rgba(255,255,255,.45)" textAnchor="middle">{b.x}</text>}
        {b.y && <text x={6} y={T + 4} fontSize="8" fill="rgba(255,255,255,.45)">{b.y}</text>}
      </svg>
    </div>
  );
}

export default function TutorBoard({ board: b }) {
  if (!b) return null;
  if (b.type === 'chart') return <Chart b={b} />;
  if (b.type === 'steps') return (
    <div>
      {b.title && <div style={ink.title}>{b.title}</div>}
      {(b.items || []).map((it, i) => (
        <motion.div key={i} {...rise(i)} style={{ display: 'flex', gap: 7, fontSize: 12, lineHeight: 1.45, margin: '4px 0' }}>
          <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 9, background: '#34D399', color: '#0B0F14', fontSize: 10.5, fontWeight: 900, display: 'grid', placeItems: 'center' }}>{i + 1}</span><span>{it}</span>
        </motion.div>
      ))}
    </div>
  );
  if (b.type === 'code') return (
    <div>
      <div style={ink.title}>⌨️ {b.lang || 'code'}</div>
      <motion.pre initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ margin: 0, fontSize: 10.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, Menlo, monospace', color: '#A7F3D0', background: 'rgba(0,0,0,.35)', padding: 8, borderRadius: 8 }}>{b.code}</motion.pre>
    </div>
  );
  if (b.type === 'big') return (
    <div style={{ textAlign: 'center', padding: '10px 0' }}>
      <motion.div initial={{ scale: 0.4, opacity: 0, rotate: -6 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 12 }} style={{ fontSize: 20, fontWeight: 900, color: '#E9D8A6', lineHeight: 1.25 }}>{b.text}</motion.div>
      {b.sub && <motion.div {...rise(1)} style={{ fontSize: 11.5, color: 'rgba(255,255,255,.7)', marginTop: 6 }}>{b.sub}</motion.div>}
    </div>
  );
  if (b.type === 'compare') return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {[b.left, b.right].map((side, k) => side && (
        <motion.div key={k} initial={{ opacity: 0, x: k ? 14 : -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + k * 0.4 }} style={{ background: k ? 'rgba(96,165,250,.12)' : 'rgba(52,211,153,.12)', borderRadius: 8, padding: 7 }}>
          <div style={{ fontWeight: 800, fontSize: 11.5, marginBottom: 4, color: k ? '#93C5FD' : '#6EE7B7' }}>{side.title}</div>
          {(side.items || []).map((it, i) => <div key={i} style={{ fontSize: 11, lineHeight: 1.4, margin: '3px 0' }}>• {it}</div>)}
        </motion.div>
      ))}
    </div>
  );
  if (b.type === 'flow') return (
    <div>
      {b.title && <div style={ink.title}>{b.title}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        {(b.nodes || []).map((n, i) => (
          <motion.div key={i} {...rise(i)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {i > 0 && <div style={{ color: '#34D399', fontSize: 12, lineHeight: 1 }}>▼</div>}
            <div style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(52,211,153,.5)', background: 'rgba(52,211,153,.08)', textAlign: 'center' }}>{n}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
  if (b.type === 'story') return (
    <motion.div initial={{ scaleY: 0.2, opacity: 0 }} animate={{ scaleY: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 140, damping: 16 }} style={{ transformOrigin: 'top', background: 'linear-gradient(180deg,#F5E6C4,#E8D3A3)', color: '#3B2A12', borderRadius: 8, padding: 9 }}>
      <div style={{ fontWeight: 900, fontSize: 12, marginBottom: 4 }}>📜 {b.title || 'Story time'}</div>
      <div style={{ fontSize: 11.5, lineHeight: 1.5, fontStyle: 'italic' }}>{b.text}</div>
    </motion.div>
  );
  return null;
}

// The same board as Markdown, for "Save to notes".
export function boardToMd(b) {
  if (!b) return '';
  switch (b.type) {
    case 'chart': return `**${b.title || 'Chart'}**${b.x || b.y ? ` (${[b.x, b.y].filter(Boolean).join(' vs ')})` : ''}\n${(b.points || []).map((p) => `- ${p[0]}: ${p[1]}`).join('\n')}`;
    case 'steps': return `**${b.title || 'Steps'}**\n${(b.items || []).map((x, i) => `${i + 1}. ${x}`).join('\n')}`;
    case 'code': return '```' + (b.lang || '') + '\n' + b.code + '\n```';
    case 'big': return `**${b.text}**${b.sub ? `\n${b.sub}` : ''}`;
    case 'compare': return [b.left, b.right].filter(Boolean).map((s) => `**${s.title}**\n${(s.items || []).map((x) => `- ${x}`).join('\n')}`).join('\n\n');
    case 'flow': return `**${b.title || 'Flow'}**\n${(b.nodes || []).join(' → ')}`;
    case 'story': return `**${b.title || 'Story'}**\n${b.text}`;
    default: return '';
  }
}
