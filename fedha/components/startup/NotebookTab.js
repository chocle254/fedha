import { useState } from 'react';
import { genId, todayISO } from '../../lib/utils';

// The founder's notebook: interviews, user tests, meetings, ideas, decisions.
// Muse reads the latest notes, so its advice uses what you actually heard.
const KINDS = [
  { id: 'interview', label: 'Interview', emoji: '🎙️', template: 'Who: \nTheir situation: \nLast time the problem happened: \nWhat they do about it today: \nWhat it costs them (time/money): \nExact quote that stood out: \nSignal (strong / weak / none): ' },
  { id: 'test', label: 'User test', emoji: '🧪', template: 'Who tested: \nTask I gave them: \nWhere they got stuck: \nWhat they liked: \nWhat to change: ' },
  { id: 'meeting', label: 'Meeting', emoji: '🤝', template: 'With: \nWhy we met: \nWhat they said: \nNext step + date: ' },
  { id: 'idea', label: 'Idea', emoji: '💡', template: '' },
  { id: 'feedback', label: 'Pitch feedback', emoji: '🎤', template: 'From: \nWhat landed: \nWhat confused them: \nQuestions they asked: ' },
  { id: 'decision', label: 'Decision', emoji: '⚖️', template: 'Decision: \nWhy: \nWhat would make me change it: ' },
];
const kindOf = (id) => KINDS.find((k) => k.id === id) || KINDS[3];

export default function NotebookTab({ startup, save, onAsk }) {
  const notes = startup.notebook || [];
  const [kind, setKind] = useState('interview');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState(KINDS[0].template);
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState(null);
  const [writing, setWriting] = useState(false);

  function pickKind(id) {
    const cur = kindOf(kind);
    setKind(id);
    // Swap the template only if the body is still the untouched template.
    if (!body.trim() || body === cur.template) setBody(kindOf(id).template);
  }
  function add() {
    if (!title.trim() && !body.trim()) return;
    const note = { id: genId(), date: todayISO(), kind, title: title.trim() || kindOf(kind).label, body: body.trim() };
    save({ notebook: [note, ...notes].slice(0, 300) });
    setTitle(''); setBody(kindOf(kind).template); setWriting(false);
  }
  function remove(id) {
    if (!window.confirm('Delete this note?')) return;
    save({ notebook: notes.filter((n) => n.id !== id) });
  }

  const shown = filter === 'all' ? notes : notes.filter((n) => n.kind === filter);
  const interviews = notes.filter((n) => n.kind === 'interview').length;

  return (
    <div className="muse-col" style={{ padding: '16px 20px 0' }}>
      <section className="card muse-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="muse-label">📓 FOUNDER NOTEBOOK</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{notes.length} note{notes.length === 1 ? '' : 's'} · {interviews} interview{interviews === 1 ? '' : 's'}</div>
        </div>
        {!writing ? (
          <>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '8px 0 12px', lineHeight: 1.5 }}>Write down every interview, test and meeting right after it happens. Muse reads these, so its advice is based on what users actually told you.</div>
            <button className="btn-primary muse-send" onClick={() => setWriting(true)}>+ New note</button>
          </>
        ) : (
          <div style={{ marginTop: 10 }}>
            <div className="muse-suggest" style={{ marginTop: 0 }}>
              {KINDS.map((k) => (
                <button key={k.id} type="button" onClick={() => pickKind(k.id)} style={k.id === kind ? { borderColor: '#7B61FF', background: 'rgba(123,97,255,0.15)' } : undefined}>{k.emoji} {k.label}</button>
              ))}
            </div>
            <input className="input" style={{ marginTop: 10 }} placeholder={kind === 'interview' ? 'e.g. Interview — Mary, mama mboga at Kapsoya' : 'Title'} value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea className="input" rows={8} style={{ marginTop: 8, lineHeight: 1.5, resize: 'vertical' }} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write it down…" />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn-primary muse-send" style={{ flex: 1 }} onClick={add} disabled={!title.trim() && !body.trim()}>Save note</button>
              <button className="btn-ghost" style={{ width: 'auto', padding: '0 14px' }} onClick={() => setWriting(false)}>Cancel</button>
            </div>
          </div>
        )}
      </section>

      {notes.length > 0 && (
        <>
          <div className="muse-suggest" style={{ marginTop: 0 }}>
            <button type="button" onClick={() => setFilter('all')} style={filter === 'all' ? { borderColor: '#7B61FF' } : undefined}>All</button>
            {KINDS.filter((k) => notes.some((n) => n.kind === k.id)).map((k) => (
              <button key={k.id} type="button" onClick={() => setFilter(k.id)} style={filter === k.id ? { borderColor: '#7B61FF' } : undefined}>{k.emoji} {k.label}</button>
            ))}
          </div>
          {interviews >= 2 && (
            <button type="button" className="muse-bubble muse-notice muse-tone-info" style={{ textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', width: '100%' }}
              onClick={() => onAsk('Read my interview notes. What patterns do you see, how strong is the evidence that this problem is real, and what should I ask in the next interviews?')}>
              <div className="muse-bubble-kicker">ASK MUSE</div>
              What do my {interviews} interviews really say? Tap for patterns and gaps →
            </button>
          )}
          {shown.map((n) => {
            const k = kindOf(n.kind);
            const open = openId === n.id;
            return (
              <div key={n.id} className="card muse-card" style={{ padding: 14 }}>
                <button type="button" onClick={() => setOpenId(open ? null : n.id)} style={{ display: 'flex', gap: 10, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: 'inherit', fontFamily: 'inherit' }}>
                  <span style={{ fontSize: 20 }}>{k.emoji}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>{n.title}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{k.label} · {n.date}</span>
                    {!open && n.body && <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-2)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body.replace(/\n/g, ' · ')}</span>}
                  </span>
                </button>
                {open && (
                  <>
                    <div style={{ fontSize: 13, color: 'var(--text-2)', whiteSpace: 'pre-wrap', lineHeight: 1.55, marginTop: 10 }}>{n.body}</div>
                    <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
                      <button className="muse-link" onClick={() => onAsk(`About my note "${n.title}" (${k.label}, ${n.date}):\n${n.body}\n\nWhat does this tell me and what should I do next?`)}>Ask Muse about this →</button>
                      <button className="muse-link" style={{ color: 'var(--red)' }} onClick={() => remove(n.id)}>Delete</button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
