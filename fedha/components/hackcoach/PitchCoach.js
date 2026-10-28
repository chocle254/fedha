import { useEffect, useRef, useState } from 'react';
import { coachAsk, hackForAI } from '../../lib/hack-coach';

// Pitch coach for a nervous presenter.
//  1. Calm: a short guided breathing drill before practising (or before going on stage).
//  2. Kit: an autopilot opener, short cue cards (say / show / seconds), a closer, recovery lines, likely Q&A.
//  3. Rehearse: a full-screen teleprompter that steps through the cues on a timer while the phone listens
//     (speech-to-text in Chrome). "I'm lost" shows a recovery line and the cue in big text, to practise
//     coming back from a blank. Afterwards the mentor scores the run: pace, fillers, missed cues, better lines.
const LENGTHS = [[60, '1 min'], [120, '2 min'], [180, '3 min'], [300, '5 min']];
const FILLERS = /\b(um+|uh+|erm|like|you know|basically|actually|sort of|kind of|i mean)\b/gi;
const BREATH = [['Breathe in', 4], ['Hold', 4], ['Breathe out slowly', 6]];

function Breathing({ onDone }) {
  const [i, setI] = useState(0);
  const [left, setLeft] = useState(BREATH[0][1]);
  useEffect(() => {
    if (i >= BREATH.length * 3) { onDone(); return undefined; }
    setLeft(BREATH[i % 3][1]);
    const tick = setInterval(() => setLeft((x) => x - 1), 1000);
    const next = setTimeout(() => setI((x) => x + 1), BREATH[i % 3][1] * 1000);
    return () => { clearInterval(tick); clearTimeout(next); };
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  const [label, secs] = BREATH[i % 3] || BREATH[0];
  const scale = label === 'Breathe in' ? 1.35 : label === 'Hold' ? 1.35 : 0.85;
  return (
    <div className="pc-full" onClick={onDone}>
      <div className="pc-breath" style={{ transform: `scale(${scale})`, transitionDuration: `${secs}s` }} />
      <div className="pc-big">{label}</div>
      <div className="pc-sub">{Math.max(0, left)} · round {Math.floor(i / 3) + 1} of 3 · tap to skip</div>
    </div>
  );
}

export default function PitchCoach({ hack, saveCoach }) {
  const coach = hack.coach || {};
  const kit = coach.pitch;
  const [secs, setSecs] = useState(kit?.seconds || 180);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [calm, setCalm] = useState(false);
  const [run, setRun] = useState(null); // { start, cue, cueStart, lost }
  const [feedback, setFeedback] = useState(null);
  const recRef = useRef(null);
  const textRef = useRef('');
  const liveRef = useRef(false);
  const [heard, setHeard] = useState('');
  const [, force] = useState(0);

  // Teleprompter clock: re-render every 250 ms and auto-advance cues on their time.
  useEffect(() => {
    if (!run) return undefined;
    const t = setInterval(() => {
      force((x) => x + 1);
      const cue = kit.cues[run.cue];
      if (cue && !run.lost && Date.now() - run.cueStart > cue.seconds * 1000 && run.cue < kit.cues.length - 1) {
        setRun((r) => ({ ...r, cue: r.cue + 1, cueStart: Date.now() }));
      }
    }, 250);
    return () => clearInterval(t);
  }, [run, kit]);

  const buildKit = async () => {
    setBusy('kit'); setErr('');
    try {
      const r = await coachAsk('hack_pitch', { hack: hackForAI(hack), seconds: secs, notes });
      await saveCoach({ pitch: { ...r.pitch, seconds: secs, at: new Date().toISOString() } });
    } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };

  const startListening = () => {
    const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    textRef.current = '';
    setHeard('');
    if (!SR) return false;
    const rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let finalText = '';
      let interim = '';
      for (let i = 0; i < e.results.length; i++) (e.results[i].isFinal ? (finalText += `${e.results[i][0].transcript} `) : (interim += e.results[i][0].transcript));
      rec._final = finalText;
      setHeard(`${(rec._prev || '') + finalText}${interim}`.slice(-160));
    };
    // Android stops listening after a pause: keep restarting while the run is live, keeping what was heard.
    rec.onend = () => {
      rec._prev = `${rec._prev || ''}${rec._final || ''}`;
      rec._final = '';
      textRef.current = rec._prev;
      if (liveRef.current) { try { rec.start(); } catch { /* already starting */ } }
    };
    rec.onerror = () => {};
    try { rec.start(); } catch { return false; }
    recRef.current = rec;
    return true;
  };

  const start = () => {
    setFeedback(null); setErr('');
    liveRef.current = true;
    const listening = startListening();
    setRun({ start: Date.now(), cue: 0, cueStart: Date.now(), lost: false, listening });
  };

  const stop = async () => {
    const r = run;
    liveRef.current = false;
    const rec = recRef.current;
    if (rec) { rec._prev = `${rec._prev || ''}${rec._final || ''}`; textRef.current = rec._prev; try { rec.stop(); } catch { /* stopped */ } }
    setRun(null);
    const seconds = Math.round((Date.now() - r.start) / 1000);
    const transcript = (textRef.current || '').trim();
    const words = transcript ? transcript.split(/\s+/).length : 0;
    const wpm = seconds ? Math.round((words / seconds) * 60) : 0;
    const fillers = (transcript.match(FILLERS) || []).length;
    const entry = { at: new Date().toISOString(), seconds, words, wpm, fillers };
    if (!transcript || seconds < 10) {
      await saveCoach({ rehearsals: [entry, ...(coach.rehearsals || [])].slice(0, 12) });
      setErr(transcript ? 'That run was under 10 seconds. Try a full run.' : 'The phone did not hear any speech (allow the microphone, or rehearse in Chrome). Your time was still saved.');
      return;
    }
    setBusy('score');
    try {
      const res = await coachAsk('hack_rehearse', { hack: { name: hack.name, coach: { idea: coach.idea } }, cues: kit.cues, target: kit.seconds, seconds, wpm, fillers, transcript });
      setFeedback({ ...res.feedback, seconds, wpm, fillers });
      await saveCoach({ rehearsals: [{ ...entry, score: res.feedback.score }, ...(coach.rehearsals || [])].slice(0, 12) });
    } catch (e) {
      setErr(e.message);
      await saveCoach({ rehearsals: [entry, ...(coach.rehearsals || [])].slice(0, 12) });
    } finally { setBusy(''); }
  };

  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const best = (coach.rehearsals || []).filter((x) => x.score != null).reduce((m, x) => Math.max(m, x.score), 0);

  return (
    <div className="muse-grid"><div className="muse-col">
      <style>{CSS}</style>
      {calm && <Breathing onDone={() => setCalm(false)} />}

      {run && kit && (() => {
        const cue = kit.cues[run.cue];
        const el = (Date.now() - run.start) / 1000;
        const cueEl = (Date.now() - run.cueStart) / 1000;
        const recovery = kit.recovery?.[run.cue % Math.max(1, kit.recovery.length)];
        return (
          <div className="pc-full pc-prompter">
            <div className="pc-top"><span>{fmt(el)} / {fmt(kit.seconds)}</span><span>{run.cue + 1}/{kit.cues.length}</span><span>{run.listening ? '🎙 listening' : '🔇 no mic'}</span></div>
            <div className="pc-cuebar"><div style={{ width: `${Math.min(100, (cueEl / cue.seconds) * 100)}%` }} /></div>
            {run.cue === 0 && !run.lost && <div className="pc-opener">“{kit.opener}”</div>}
            {run.lost ? (
              <>
                <div className="pc-kicker">SAY THIS, THEN CARRY ON</div>
                <div className="pc-big">“{recovery || 'Let me show you instead.'}”</div>
                <div className="pc-title" style={{ marginTop: 24 }}>{cue.title}</div>
                <div className="pc-say">{cue.say}</div>
              </>
            ) : (
              <>
                <div className="pc-title">{cue.title}</div>
                <div className="pc-say">{cue.say}</div>
                {cue.show && <div className="pc-show">On screen: {cue.show}</div>}
              </>
            )}
            {heard && <div className="pc-heard">…{heard}</div>}
            <div className="pc-actions">
              <button type="button" onClick={() => setRun((r) => ({ ...r, cue: Math.max(0, r.cue - 1), cueStart: Date.now(), lost: false }))}>◀</button>
              <button type="button" className="pc-lost" onClick={() => setRun((r) => ({ ...r, lost: !r.lost }))}>{run.lost ? 'Back on track' : "I'm lost"}</button>
              <button type="button" onClick={() => setRun((r) => ({ ...r, cue: Math.min(kit.cues.length - 1, r.cue + 1), cueStart: Date.now(), lost: false }))}>▶</button>
            </div>
            <button type="button" className="btn-primary pc-stop" onClick={stop}>{run.cue === kit.cues.length - 1 ? `Finish: “${kit.closer.slice(0, 40)}…”` : 'Stop and get feedback'}</button>
          </div>
        );
      })()}

      <section className="card muse-card">
        <div className="muse-label">🎤 PITCH COACH</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.5 }}>
          Nerves are normal. The kit gives you a first line you can say on autopilot, short cues instead of a script, and lines to recover when you blank. Rehearse out loud a few times and your score climbs.
        </div>
        <div className="muse-suggest" style={{ marginTop: 10 }}>
          {LENGTHS.map(([v, l]) => <button key={v} type="button" onClick={() => setSecs(v)} style={secs === v ? { borderColor: '#7B61FF', background: 'rgba(123,97,255,0.15)' } : undefined}>{l}</button>)}
        </div>
        <textarea className="input" rows={2} style={{ marginTop: 8 }} placeholder="Anything the pitch must mention? (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={buildKit} disabled={!!busy || !coach.idea}>{busy === 'kit' ? 'Writing your pitch…' : kit ? '↻ Rewrite the pitch kit' : '✨ Build my pitch kit'}</button>
          <button className="btn-ghost" type="button" onClick={() => setCalm(true)}>🫁 Calm me first</button>
        </div>
        {!coach.idea && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>Pick an idea first so the pitch is about your project.</div>}
        {err && <div style={{ fontSize: 12.5, color: '#EF4444', marginTop: 8 }}>{err}</div>}
      </section>

      {kit && (
        <section className="card muse-card">
          <div className="muse-label">YOUR FIRST LINE (SAY IT ON AUTOPILOT)</div>
          <div style={{ fontSize: 17, fontWeight: 700, marginTop: 6, lineHeight: 1.4 }}>“{kit.opener}”</div>
          {kit.one_liner && <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 6 }}>In one line: {kit.one_liner}</div>}
          <button className="btn-primary" style={{ marginTop: 12, width: '100%' }} onClick={start} disabled={!!busy}>{busy === 'score' ? 'Scoring your run…' : '▶ Rehearse now (full screen)'}</button>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>Speak out loud; the phone listens so the mentor can score you. Record a backup demo video too, in case the live demo breaks.</div>
          {(coach.rehearsals || []).length > 0 && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 8 }}>Rehearsals: {coach.rehearsals.length}{best ? ` · best score ${best}/100` : ''} · last {fmt(coach.rehearsals[0].seconds)} at {coach.rehearsals[0].wpm} wpm</div>}
        </section>
      )}

      {feedback && (
        <section className="card muse-card">
          <div className="muse-label">HOW THAT RUN WENT</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
            <span className="font-num" style={{ fontSize: 30, fontWeight: 800, color: feedback.score >= 75 ? '#10B981' : feedback.score >= 50 ? '#F59E0B' : '#EF4444' }}>{feedback.score}</span>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{feedback.headline}</span>
          </div>
          <div className="font-num" style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{fmt(feedback.seconds)} · {feedback.wpm} wpm{feedback.pace ? ` (${feedback.pace})` : ''} · {feedback.fillers} filler word{feedback.fillers === 1 ? '' : 's'}</div>
          {feedback.strong?.length > 0 && <><div className="muse-label" style={{ marginTop: 10, color: 'var(--green)' }}>WHAT WORKED</div><ul className="muse-how">{feedback.strong.map((x) => <li key={x}>{x}</li>)}</ul></>}
          {feedback.fix?.length > 0 && <><div className="muse-label" style={{ marginTop: 10 }}>CHANGE NEXT TIME</div><ul className="muse-how">{feedback.fix.map((x) => <li key={x}>{x}</li>)}</ul></>}
          {feedback.missed?.length > 0 && <div style={{ fontSize: 12.5, color: '#F59E0B', marginTop: 6 }}>Skipped or rushed: {feedback.missed.join(', ')}</div>}
          {feedback.better_lines?.map((l) => <div key={l.was} style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.5 }}><span style={{ color: 'var(--text-3)', textDecoration: 'line-through' }}>{l.was}</span><br /><span style={{ color: 'var(--green)' }}>→ {l.try}</span></div>)}
          {feedback.next_drill && <div className="muse-bubble" style={{ marginTop: 10 }}><div className="muse-bubble-kicker">NEXT DRILL</div>{feedback.next_drill}</div>}
        </section>
      )}

      {kit && (
        <section className="card muse-card">
          <div className="muse-label">CUE CARDS</div>
          {kit.cues.map((c, i) => (
            <div key={i} style={{ marginTop: 10, paddingTop: 10, borderTop: i ? '1px solid var(--border)' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 700 }}><span>{i + 1}. {c.title}</span><span className="font-num" style={{ color: 'var(--text-3)', fontWeight: 500 }}>{c.seconds}s</span></div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 3, lineHeight: 1.5 }}>{c.say}</div>
              {c.show && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3 }}>On screen: {c.show}</div>}
            </div>
          ))}
          <div className="muse-label" style={{ marginTop: 14 }}>LAST LINE</div>
          <div style={{ fontSize: 13.5, marginTop: 4 }}>“{kit.closer}”</div>
        </section>
      )}

      {kit?.recovery?.length > 0 && (
        <section className="card muse-card">
          <div className="muse-label">IF YOU BLANK OR SOMETHING BREAKS</div>
          <ul className="muse-how">{kit.recovery.map((x) => <li key={x}>“{x}”</li>)}</ul>
          {kit.calm?.length > 0 && <><div className="muse-label" style={{ marginTop: 10 }}>THE MINUTE BEFORE YOU GO ON</div><ul className="muse-how">{kit.calm.map((x) => <li key={x}>{x}</li>)}</ul></>}
        </section>
      )}

      {kit?.qa?.length > 0 && (
        <section className="card muse-card">
          <div className="muse-label">QUESTIONS THE JUDGES WILL LIKELY ASK</div>
          {kit.qa.map((x) => <div key={x.q} style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5 }}><b>{x.q}</b><br /><span style={{ color: 'var(--text-2)' }}>{x.a}</span></div>)}
        </section>
      )}
    </div></div>
  );
}

const CSS = `
.pc-full{position:fixed;inset:0;z-index:9000;background:radial-gradient(120% 90% at 50% 30%,#141a2e,#05060B);color:#F3F4F6;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center}
.pc-breath{width:150px;height:150px;border-radius:50%;background:radial-gradient(circle,#E9C77B55,#7B61FF22 70%,transparent);border:1px solid #E9C77B66;transition-property:transform;transition-timing-function:ease-in-out;margin-bottom:40px}
.pc-big{font-size:26px;font-weight:700;line-height:1.3;max-width:560px}
.pc-sub{font-size:13px;color:#9CA3AF;margin-top:10px}
.pc-prompter{justify-content:flex-start;padding-top:28px}
.pc-top{display:flex;justify-content:space-between;width:100%;max-width:640px;font-size:13px;color:#9CA3AF;font-variant-numeric:tabular-nums}
.pc-cuebar{width:100%;max-width:640px;height:4px;border-radius:4px;background:#ffffff1a;margin:10px 0 28px;overflow:hidden}
.pc-cuebar div{height:100%;background:linear-gradient(90deg,#7B61FF,#E9C77B);transition:width .25s linear}
.pc-opener{font-size:15px;color:#E9C77B;margin-bottom:18px;max-width:560px;font-style:italic}
.pc-kicker{font-size:11px;letter-spacing:.14em;color:#F59E0B;margin-bottom:10px}
.pc-title{font-size:34px;font-weight:800;letter-spacing:-.01em;max-width:640px}
.pc-say{font-size:20px;line-height:1.5;color:#D1D5DB;margin-top:14px;max-width:600px}
.pc-show{font-size:13px;color:#9CA3AF;margin-top:14px}
.pc-heard{font-size:12px;color:#6B7280;margin-top:auto;max-width:600px;min-height:18px}
.pc-actions{display:flex;gap:12px;margin-top:18px}
.pc-actions button{min-width:64px;padding:14px 18px;border-radius:14px;border:1px solid #ffffff26;background:#ffffff0d;color:#F3F4F6;font-size:16px;font-family:inherit}
.pc-actions .pc-lost{border-color:#F59E0B88;color:#F59E0B;font-weight:700;min-width:150px}
.pc-stop{margin-top:14px;width:100%;max-width:420px;margin-bottom:12px}
`;
