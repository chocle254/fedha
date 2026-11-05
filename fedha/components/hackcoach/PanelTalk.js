import { useEffect, useRef, useState } from 'react';

// The judges' deliberation as a chat: each judge speaks in turn, bubbles appear one by one the first time
// a verdict is opened (with a "typing" pause), and it can be replayed or shown all at once.
const COLORS = ['#7B61FF', '#10B981', '#F59E0B', '#E64FB4'];
const initials = (t) => String(t || '?').split(/[\s·]+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

export default function PanelTalk({ verdict }) {
  const talk = verdict.discussion || [];
  const judges = verdict.judges || [];
  const who = (k) => {
    const i = Math.max(0, judges.findIndex((j) => j.key === k));
    return { name: judges[i]?.role || k, color: COLORS[i % COLORS.length], right: i % 2 === 1 };
  };
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const seenKey = `luxe-panel-seen-${verdict.at}`;
  const [shown, setShown] = useState(talk.length);
  const timer = useRef(null);
  const endRef = useRef(null);

  const play = () => {
    clearInterval(timer.current);
    setShown(0);
    let n = 0;
    timer.current = setInterval(() => {
      n += 1; setShown(n);
      if (n >= talk.length) clearInterval(timer.current);
    }, 1700);
  };
  // Play it the first time this verdict is opened.
  useEffect(() => {
    if (!talk.length || reduce) return undefined;
    try { if (!localStorage.getItem(seenKey)) { localStorage.setItem(seenKey, '1'); play(); } } catch { /* private mode */ }
    return () => clearInterval(timer.current);
  }, [verdict.at]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (shown > 0 && shown < talk.length) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [shown, talk.length]);

  if (!talk.length) return null;
  const next = shown < talk.length ? who(talk[shown].who) : null;
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div className="muse-label">🗣️ THE PANEL DISCUSSES</div>
        <button className="muse-link" style={{ marginTop: 0, fontSize: 11.5 }} onClick={() => (shown < talk.length ? (clearInterval(timer.current), setShown(talk.length)) : play())}>
          {shown < talk.length ? 'Show all' : '↻ Replay'}
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        {talk.slice(0, shown).map((t, i) => {
          const w = who(t.who);
          return (
            <div key={i} style={{ display: 'flex', gap: 8, flexDirection: w.right ? 'row-reverse' : 'row', alignItems: 'flex-end', animation: 'fadeIn 0.3s ease' }}>
              <div title={w.name} style={{ flex: '0 0 28px', height: 28, borderRadius: 999, background: w.color, color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initials(w.name)}</div>
              <div style={{ maxWidth: '80%', padding: '8px 12px', borderRadius: 14, background: 'var(--bg-2)', border: `1px solid ${w.color}55`, [w.right ? 'borderBottomRightRadius' : 'borderBottomLeftRadius']: 4 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: w.color, marginBottom: 2 }}>{w.name}</div>
                <div style={{ fontSize: 13, lineHeight: 1.45 }}>{t.says}</div>
              </div>
            </div>
          );
        })}
        {next && (
          <div style={{ display: 'flex', gap: 8, flexDirection: next.right ? 'row-reverse' : 'row', alignItems: 'center' }}>
            <div style={{ flex: '0 0 28px', height: 28, borderRadius: 999, background: next.color, opacity: 0.6 }} />
            <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>{next.name.split(' · ')[0]} is typing…</div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      {shown >= talk.length && verdict.dissent && <div style={{ fontSize: 12, marginTop: 8, color: '#F59E0B' }}>Still disagrees: {verdict.dissent}</div>}
    </div>
  );
}
