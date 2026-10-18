import { useState, useEffect, useRef } from 'react';
import { genId, todayISO } from '../../lib/utils';
import { INVESTORS } from '../../lib/founder-playbook';
import { museAsk, startupForAI, scoreColor } from './museApi';

const DECISION = {
  invest: { label: 'Would invest', color: '#10B981', emoji: '🤝' },
  maybe: { label: 'Maybe — needs more', color: '#F59E0B', emoji: '🤔' },
  pass: { label: 'Pass for now', color: '#EF4444', emoji: '🚪' },
};

// Investor Room: an AI investor (pick who) questions you one question at a
// time, then decides — invest, maybe or pass — and tells you why.
export default function InvestorTab({ startup, stages, save }) {
  const sessions = startup.investor_sessions || [];
  const [session, setSession] = useState(null); // the meeting on screen
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [retryEnd, setRetryEnd] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [session?.turns?.length, busy]);

  function store(s) {
    setSession(s);
    const others = (startup.investor_sessions || []).filter((x) => x.id !== s.id);
    save({ investor_sessions: [s, ...others].slice(0, 8) });
  }

  async function turn(s, endMeeting = false) {
    setBusy(true); setErr(''); setRetryEnd(endMeeting);
    try {
      const r = await museAsk('investor_turn', {
        startup: startupForAI(startup, stages),
        investor: s.investor,
        transcript_turns: s.turns.map((t) => ({ role: t.role, text: t.text })),
        end_meeting: endMeeting,
      });
      const next = { ...s, turns: [...s.turns, { id: genId(), role: 'investor', text: r.message }] };
      if (r.done && r.verdict) next.verdict = r.verdict;
      store(next);
    } catch (e) {
      setErr(`${e.message}. Tap retry.`);
      setSession(s);
    }
    setBusy(false);
  }

  function start(inv) {
    const s = { id: genId(), investor: inv.id, at: todayISO(), turns: [] };
    setSession(s);
    turn(s);
  }
  function reply() {
    const text = answer.trim();
    if (!text || !session || busy) return;
    const s = { ...session, turns: [...session.turns, { id: genId(), role: 'founder', text }] };
    setAnswer('');
    setSession(s);
    turn(s);
  }

  // ── Picking an investor ──
  if (!session) {
    return (
      <div className="muse-col" style={{ padding: '16px 20px 0' }}>
        <section className="card muse-card">
          <div className="muse-label">💼 INVESTOR ROOM</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '8px 0 4px', lineHeight: 1.5 }}>
            Practise the real thing. An AI investor reads your journey, pitch and notebook, asks you about 6 hard questions one at a time, then decides whether they'd invest — and what would change their mind.
          </div>
        </section>
        <div className="muse-investors">
          {INVESTORS.map((inv) => (
            <button key={inv.id} type="button" className="muse-investor" onClick={() => start(inv)}>
              <span style={{ fontSize: 30 }}>{inv.emoji}</span>
              <span style={{ fontWeight: 800, fontSize: 14.5, marginTop: 6 }}>{inv.name}</span>
              <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{inv.role}</span>
              <span style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 6, lineHeight: 1.4 }}>{inv.style.split('. ').slice(1, 2).join('') || inv.style}</span>
              <span className="muse-link" style={{ marginTop: 'auto', paddingTop: 8 }}>Start meeting →</span>
            </button>
          ))}
        </div>
        {sessions.length > 0 && (
          <section className="card muse-card">
            <div className="muse-label">PAST MEETINGS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              {sessions.map((s) => {
                const inv = INVESTORS.find((i) => i.id === s.investor) || INVESTORS[0];
                const d = s.verdict ? DECISION[s.verdict.decision] : null;
                return (
                  <button key={s.id} type="button" className="muse-task" onClick={() => setSession(s)}>
                    <span style={{ fontSize: 20 }}>{inv.emoji}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="muse-task-text">{inv.name} · {s.at}</span>
                      <span className="muse-task-why">{d ? `${d.emoji} ${d.label} · ${s.verdict.score}/100` : `Unfinished · ${s.turns.filter((t) => t.role === 'founder').length} answers`}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    );
  }

  // ── In the meeting ──
  const inv = INVESTORS.find((i) => i.id === session.investor) || INVESTORS[0];
  const answered = session.turns.filter((t) => t.role === 'founder').length;
  const v = session.verdict;
  const d = v ? DECISION[v.decision] || DECISION.maybe : null;
  const lastIsFounder = session.turns[session.turns.length - 1]?.role === 'founder';

  return (
    <div className="muse-col" style={{ padding: '16px 20px 0' }}>
      <section className="card muse-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 32 }}>{inv.emoji}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{inv.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{inv.role}</div>
          </div>
          {!v && <span className="muse-status"><i />Question {Math.min(answered + 1, 6)}/6</span>}
        </div>

        <div className="muse-chat" style={{ maxHeight: 460 }}>
          {session.turns.map((t) => (
            <div key={t.id} className={`muse-msg ${t.role === 'founder' ? 'me' : 'them'}`}>
              {t.role !== 'founder' && <span style={{ fontSize: 18 }}>{inv.emoji}</span>}
              <div className="muse-msg-body">{t.text}</div>
            </div>
          ))}
          {busy && <div className="muse-msg them"><span style={{ fontSize: 18 }}>{inv.emoji}</span><div className="muse-msg-body muse-typing"><i /><i /><i /></div></div>}
          <div ref={endRef} />
        </div>

        {err && (
          <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>
            {err} <button className="muse-link" onClick={() => turn(session, retryEnd)}>Retry</button>
          </div>
        )}

        {!v && !busy && !err && session.turns.length > 0 && !lastIsFounder && (
          <>
            <textarea className="input" rows={3} style={{ marginTop: 12, lineHeight: 1.5, resize: 'vertical' }} placeholder="Answer like you're in the room — specific, honest, with numbers if you have them." value={answer} onChange={(e) => setAnswer(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn-primary muse-send" style={{ flex: 1 }} disabled={!answer.trim()} onClick={reply}>Answer ↑</button>
              {answered >= 2 && <button className="btn-ghost" style={{ width: 'auto', padding: '0 12px' }} onClick={() => turn(session, true)}>End & get decision</button>}
            </div>
          </>
        )}
      </section>

      {v && d && (
        <section className="card muse-card" style={{ borderColor: d.color }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="muse-score" style={{ '--c': scoreColor(v.score) }}>{v.score}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: d.color }}>{d.emoji} {d.label}</div>
              {v.amount && v.amount.toLowerCase() !== 'none' && <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4 }}>💰 {v.amount}</div>}
            </div>
          </div>
          {v.reasons?.length > 0 && <><div className="muse-label" style={{ marginTop: 14 }}>WHY</div><ul className="muse-how">{v.reasons.map((x) => <li key={x}>{x}</li>)}</ul></>}
          {v.concerns?.length > 0 && <><div className="muse-label" style={{ marginTop: 12, color: 'var(--yellow)' }}>CONCERNS</div><ul className="muse-how">{v.concerns.map((x) => <li key={x}>{x}</li>)}</ul></>}
          {v.to_change_mind?.length > 0 && <><div className="muse-label" style={{ marginTop: 12, color: 'var(--green)' }}>WHAT WOULD CHANGE MY MIND</div><ul className="muse-how">{v.to_change_mind.map((x) => <li key={x}>{x}</li>)}</ul></>}
        </section>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-ghost" style={{ flex: 1 }} onClick={() => { setSession(null); setErr(''); }}>← All investors</button>
        {v && <button className="btn-primary muse-send" style={{ flex: 1 }} onClick={() => start(inv)}>Pitch {inv.name} again</button>}
      </div>
    </div>
  );
}
