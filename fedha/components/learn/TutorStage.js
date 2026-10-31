import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ProfessorByte from './ProfessorByte';
import TutorBoard, { boardToMd } from './TutorBoard';
import Md from './Md';
import { askStudy } from '../../lib/study';
import { stopSpeaking } from '../../lib/voice';
import { speakByte, getByteVoice, setByteVoice, BYTE_VOICES } from '../../lib/byte-voice';

// The tutor stage in Study mode. Professor Byte stands behind the glass and acts each answer out as scenes:
// he says a line (out loud if voice is on), with a mood and a gesture, and puts a chart, steps, code, a story
// and so on up on his board. Between answers he idles like he's alive: looks around, knocks on the glass,
// reacts when you poke him. Every answer can be saved as a note (spoken lines plus boards, as Markdown).
const QUICK = [
  ['simple', '🧒 Simply'], ['normal', '💡 Explain'], ['deep', '🔬 Go deep'], ['example', '🧪 Examples'],
  ['mistakes', '⚠️ Mistakes'], ['story', '📜 Story time'], ['quiz', '❓ Pop quiz'],
];
const POKES = ['Hey! That tickles.', 'Careful, this glass is not cheap.', 'Yes, I am real. Mostly.', 'Poke me again and I give you homework.', 'I felt that in my circuits.', 'Ooh, attention. I like it.'];
const IDLE = ['Still with me?', 'I live here, you know. I can wait.', 'Psst. Ask me something. I get bored.', 'Fun fact: I never sleep. Do you?', 'Tap Pop quiz. I dare you.'];
const CUTS = ['Oh, interrupting the professor? Bold. Go on.', 'Whoa, okay, you talk. I am listening.', 'Rude. But I like the energy. Go.', 'Mid-sentence? Fine. Your turn.'];
const NUDGES = ['Tick tock. My circuits are getting old here.', 'Any day now. I live in here, I have time. You do not.', 'Hello? Is this thing on?', 'Take your time. Actually, no. Hurry up.', 'I can hear you thinking. Say it out loud.'];

// A short "tok" for knocks on the glass.
function tok() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(220, ac.currentTime); o.frequency.exponentialRampToValueAtTime(90, ac.currentTime + 0.08);
    g.gain.setValueAtTime(0.35, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12);
    o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.13);
    setTimeout(() => ac.close().catch(() => {}), 300);
  } catch { /* no audio */ }
}
const toMd = (a) => a.scenes.map((s) => [s.say, boardToMd(s.board)].filter(Boolean).join('\n\n')).join('\n\n');

export default function TutorStage({ active, subject, context, onSaveNote, courseId, request }) {
  const [log, setLog] = useState([]);
  const [cur, setCur] = useState(null); // { i, s, done } the scene being played
  const [talking, setTalking] = useState(false);
  const [level, setLevel] = useState(0); // loudness of his voice, for the mouth
  const [typed, setTyped] = useState('');
  const [thinking, setThinking] = useState(false);
  const [q, setQ] = useState('');
  const [voice, setVoice] = useState('troy');
  const [idle, setIdle] = useState(null); // { gesture, mood, line }
  const [ripples, setRipples] = useState([]);
  const [showLog, setShowLog] = useState(false);
  const [listening, setListening] = useState(false);
  const [live, setLive] = useState(false);
  const [heard, setHeard] = useState('');
  const [liveErr, setLiveErr] = useState('');
  const timers = useRef([]);
  const waitTimers = useRef([]);
  const playId = useRef(0);
  const speaker = useRef(null);
  const logRef = useRef(log); logRef.current = log;
  const voiceRef = useRef('troy'); voiceRef.current = voice;
  const liveRef = useRef(false); liveRef.current = live;
  const talkingRef = useRef(false); talkingRef.current = talking;
  const thinkingRef = useRef(false); thinkingRef.current = thinking;
  const saying = useRef(''); // what he is saying right now (to tell his own echo from you)
  const sayStart = useRef(0);
  const rec = useRef(null);
  const said = useRef(''); // your words so far this turn
  const endT = useRef(null);
  const cutOff = useRef(''); // what he was saying when you interrupted
  const hints = useRef(0);
  const started = useRef(false);

  useEffect(() => { setVoice(getByteVoice()); }, []);
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const clearWait = () => { waitTimers.current.forEach(clearTimeout); waitTimers.current = []; };
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.current.push(t); return t; };
  const hush = () => { speaker.current?.stop(); speaker.current = null; stopSpeaking(); setLevel(0); };
  useEffect(() => () => { clearTimers(); clearWait(); hush(); stopLive(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const knock = useCallback(() => {
    tok();
    const id = Math.random();
    setRipples((r) => [...r.slice(-3), id]);
    setTimeout(() => setRipples((r) => r.filter((x) => x !== id)), 900);
  }, []);

  // Says one line in his voice; calls done() when finished (or after a safety timeout).
  const say = (text, mood, done) => {
    hush();
    saying.current = text; sayStart.current = Date.now();
    let finished = false;
    const fin = () => { if (finished) return; finished = true; speaker.current = null; setLevel(0); done?.(); };
    const words = text.split(/\s+/).length;
    if (voiceRef.current === 'off') { later(fin, Math.max(2600, words * 330 + 900)); return; }
    speaker.current = speakByte(text, { mood, voice: voiceRef.current, onLevel: setLevel, onEnd: fin });
    later(fin, words * 650 + 9000); // safety net if audio never reports the end
  };

  // Plays scene s of answer i, then moves on by itself. After the last scene in a live class, he waits for you.
  const play = useCallback((i, s) => {
    const a = logRef.current[i];
    clearTimers(); hush();
    if (!a?.scenes?.[s]) { setCur((c) => (c ? { ...c, done: true } : c)); setTalking(false); saying.current = ''; if (liveRef.current) startWaiting(); return; }
    const id = ++playId.current;
    const scene = a.scenes[s];
    setIdle(null); setCur({ i, s, done: false }); setTalking(true); setTyped('');
    const text = scene.say;
    let k = 0;
    const type = () => { if (playId.current !== id) return; k = Math.min(text.length, k + 2); setTyped(text.slice(0, k)); if (k < text.length) later(type, 30); };
    type();
    say(text, scene.mood, () => { if (playId.current !== id) return; setTalking(false); later(() => { if (playId.current === id) play(i, s + 1); }, 550); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ask = useCallback(async (question, level, opts = {}) => {
    if (thinkingRef.current) return;
    const userText = level ? QUICK.find(([k]) => k === level)?.[1].replace(/^\S+\s/, '') || '' : String(question || '').trim();
    if (!level && !userText) return;
    clearTimers(); clearWait(); hush(); setTalking(false); setIdle(null); setHeard('');
    if (!level) hints.current = 0;
    const history = logRef.current.map((m) => ({ role: m.role, text: m.role === 'ai' ? m.scenes.map((x) => x.say).join(' ') : m.text }));
    if (!['start', 'live_start', 'hint'].includes(level)) setLog((l) => { const n = [...l, { role: 'user', text: userText }]; logRef.current = n; return n; });
    setQ(''); setThinking(true); thinkingRef.current = true;
    const show = (entry) => { setLog((l) => { const n = [...l, entry]; logRef.current = n; return n; }); setTimeout(() => play(logRef.current.length - 1, 0), 60); };
    try {
      const j = await askStudy({ type: 'stage', level: level || undefined, question: userText, topic: subject, context: context(), history, live: liveRef.current, interrupted: opts.interrupted || undefined });
      show({ role: 'ai', scenes: j.scenes || [], chips: j.chips || [] });
    } catch (e) {
      show({ role: 'ai', error: true, scenes: [{ say: e.message || 'My circuits tangled. Try again?', mood: 'surprised', gesture: 'shrug', board: null }], chips: [] });
    } finally { setThinking(false); thinkingRef.current = false; }
  }, [subject, context, play]);
  const askRef = useRef(ask); askRef.current = ask;

  // ── Live one-on-one class: he asks, you answer out loud, you can cut him off ──
  const words = (t) => String(t).toLowerCase().match(/[a-z']{3,}/g) || [];
  // Is the mic just hearing his own voice from the speaker?
  const isEcho = (t) => {
    const w = words(t); if (!w.length) return true;
    const his = new Set(words(saying.current));
    return w.filter((x) => his.has(x)).length / w.length >= 0.5;
  };
  const interrupt = (because = '') => {
    if (!talkingRef.current && !speaker.current) return;
    cutOff.current = saying.current;
    clearTimers(); hush(); playId.current++; setTalking(false); saying.current = '';
    setCur((c) => (c ? { ...c, done: true } : c));
    setIdle({ mood: 'surprised', gesture: 'shrug', line: CUTS[Math.floor(Math.random() * CUTS.length)] });
    said.current = because;
  };
  const submitHeard = () => {
    const t = said.current.trim(); said.current = ''; setHeard('');
    if (t.length < 2) return;
    const interrupted = cutOff.current; cutOff.current = '';
    askRef.current(t, null, { interrupted });
  };
  // After his question: a playful nudge at ~14 s of silence, a hint at ~32 s, then he lets you be.
  function startWaiting() {
    clearWait();
    if (hints.current >= 2) return;
    waitTimers.current.push(setTimeout(() => {
      if (!liveRef.current || said.current || thinkingRef.current) return;
      const line = NUDGES[Math.floor(Math.random() * NUDGES.length)];
      setIdle({ mood: 'impatient', gesture: 'tap', line });
      say(line, 'impatient', () => setIdle((x) => (x ? { ...x, gesture: 'tap' } : x)));
    }, 14000));
    waitTimers.current.push(setTimeout(() => {
      if (!liveRef.current || said.current || thinkingRef.current) return;
      hints.current += 1; askRef.current('', 'hint');
    }, 32000));
  }
  function stopLive() {
    liveRef.current = false; setLive(false); setHeard(''); clearWait();
    try { rec.current?.abort(); } catch { /* none */ } rec.current = null;
  }
  const startLive = () => {
    const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR) { setLiveErr("This browser can't listen. Type your answers instead; he still talks."); return; }
    setLiveErr('');
    const r = new SR();
    r.lang = 'en-US'; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
    r.onresult = (e) => {
      let fin = '', interim = '';
      for (let k = e.resultIndex; k < e.results.length; k++) { const t = e.results[k][0].transcript; if (e.results[k].isFinal) fin += t + ' '; else interim += t; }
      const now = (fin + interim).trim();
      if (!now) return;
      if (talkingRef.current || speaker.current) {
        // Talking over him: cut him off, unless it's only his own voice coming back through the mic.
        if (Date.now() - sayStart.current < 700 || isEcho(now) || words(now).length < 2) return;
        interrupt(fin);
      } else if (fin) said.current += fin;
      clearWait();
      setHeard((said.current + interim).trim());
      clearTimeout(endT.current);
      endT.current = setTimeout(() => { if (!talkingRef.current && !thinkingRef.current && said.current.trim()) submitHeard(); }, 1500);
    };
    r.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { setLiveErr('Microphone blocked. Allow it for Luxe, then try again.'); stopLive(); } };
    r.onend = () => { if (liveRef.current) setTimeout(() => { try { if (liveRef.current) r.start(); } catch { /* already running */ } }, 250); };
    try { r.start(); } catch { /* already started */ }
    rec.current = r; liveRef.current = true; setLive(true); hints.current = 0;
    ask('', 'live_start');
  };

  // He bursts in the first time you open the tutor.
  // A request from elsewhere in Study mode (e.g. "Teach me this" in Materials) goes first.
  const handled = useRef(null);
  useEffect(() => {
    if (!active) return;
    if (request && request.n !== handled.current) { handled.current = request.n; started.current = true; ask('', request.level); return; }
    if (!started.current) { started.current = true; ask('', 'start'); }
  }, [active, request?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!active) { clearTimers(); hush(); stopLive(); setTalking(false); setCur((c) => (c ? { ...c, done: true } : c)); } }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  // Idle antics while you read or think (not in a live class: there he nudges you instead).
  useEffect(() => {
    if (!active || talking || thinking || live) return undefined;
    const t = setTimeout(() => {
      const pick = [['knock', 'cheeky'], ['wave', 'happy'], ['lean', 'cheeky'], ['shrug', 'happy'], ['laugh', 'cheeky']][Math.floor(Math.random() * 5)];
      setIdle({ gesture: pick[0], mood: pick[1], line: IDLE[Math.floor(Math.random() * IDLE.length)] });
      setTimeout(() => setIdle((x) => (x ? { ...x, gesture: 'none' } : x)), 2600);
    }, 35000 + Math.random() * 25000);
    return () => clearTimeout(t);
  }, [active, talking, thinking, idle, log.length, live]);

  const poke = () => {
    if (live && talking) { interrupt(); return; }
    if (talking || thinking) return;
    setIdle({ gesture: Math.random() < 0.5 ? 'laugh' : 'shrug', mood: 'cheeky', line: POKES[Math.floor(Math.random() * POKES.length)] });
    setTimeout(() => setIdle((x) => (x ? { ...x, gesture: 'none' } : x)), 1800);
  };

  const answer = cur ? log[cur.i] : null;
  const scene = answer?.scenes?.[cur.s] || answer?.scenes?.[answer.scenes.length - 1] || null;
  // The board stays up until a later scene replaces it.
  const board = answer ? [...answer.scenes.slice(0, (cur?.s ?? 0) + 1)].reverse().find((x) => x.board)?.board || null : null;
  const boardKey = answer ? `${cur.i}-${answer.scenes.findIndex((x) => x.board === board)}` : 'none';
  const mood = idle?.mood || (heard ? 'thinking' : listening ? 'happy' : scene?.mood) || 'happy';
  const gesture = idle?.gesture || (talking ? (scene?.gesture === 'none' && board ? 'point' : scene?.gesture) : 'none') || 'none';
  const bubble = idle?.line || (cur && !cur.done ? typed : scene?.say) || (thinking ? '' : 'Ask me anything. I bite only wrong answers.');
  const lastAi = [...log].reverse().find((m) => m.role === 'ai' && !m.error);
  const chips = lastAi?.chips || [];

  return (
    <div>
      {/* the stage, behind the glass */}
      <div style={{ position: 'relative', height: 300, borderRadius: 18, overflow: 'hidden', background: 'radial-gradient(120% 90% at 30% 20%, #1B2440 0%, #0B1020 60%, #05070D 100%)', border: '1px solid rgba(125,249,255,.18)' }}>
        <div style={{ position: 'absolute', left: '-20%', right: '-20%', bottom: -40, height: 120, background: 'repeating-linear-gradient(90deg, rgba(125,249,255,.08) 0 1px, transparent 1px 34px), repeating-linear-gradient(0deg, rgba(125,249,255,.08) 0 1px, transparent 1px 22px)', transform: 'perspective(260px) rotateX(62deg)', transformOrigin: 'bottom' }} />
        <AnimatePresence mode="wait">
          {board && (
            <motion.div key={boardKey} initial={{ opacity: 0, rotateY: -35, x: 30 }} animate={{ opacity: 1, rotateY: 0, x: 0 }} exit={{ opacity: 0, rotateY: 30, x: 20 }} transition={{ type: 'spring', stiffness: 140, damping: 16 }}
              style={{ position: 'absolute', right: 10, top: 12, width: '58%', maxHeight: 214, overflowY: 'auto', padding: 10, borderRadius: 12, background: 'linear-gradient(160deg, rgba(30,41,59,.95), rgba(15,23,42,.95))', border: '2px solid #3B4A63', boxShadow: '0 10px 30px rgba(0,0,0,.5), inset 0 0 0 1px rgba(255,255,255,.04)', color: '#E5E7EB', transformPerspective: 600 }}>
              <TutorBoard board={board} />
            </motion.div>
          )}
        </AnimatePresence>
        <div role="button" tabIndex={0} aria-label="Poke Professor Byte" onClick={poke} style={{ position: 'absolute', left: board ? 2 : '50%', bottom: 4, transform: board ? 'none' : 'translateX(-50%)', transition: 'left .5s, transform .5s', cursor: 'pointer' }}>
          <ProfessorByte size={board ? 118 : 150} mood={mood} gesture={gesture} talking={talking || !!(idle && speaker.current)} level={voice === 'off' ? null : level} thinking={thinking} look={board && talking ? { x: 0.9, y: -0.2 } : (listening || heard) ? { x: 0, y: 0.9 } : null} onKnock={knock} />
        </div>
        {/* the glass: reflections, and ripples when he knocks */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(115deg, rgba(255,255,255,.10) 0%, rgba(255,255,255,0) 22%, rgba(255,255,255,0) 60%, rgba(255,255,255,.05) 68%, rgba(255,255,255,0) 76%)', boxShadow: 'inset 0 0 40px rgba(0,0,0,.55)' }} />
        {ripples.map((id) => (
          <motion.div key={id} initial={{ scale: 0.2, opacity: 0.8 }} animate={{ scale: 2.4, opacity: 0 }} transition={{ duration: 0.8 }}
            style={{ position: 'absolute', left: board ? 70 : '55%', bottom: 120, width: 60, height: 60, marginLeft: -30, borderRadius: '50%', border: '2px solid rgba(200,250,255,.7)', pointerEvents: 'none' }} />
        ))}
        <div style={{ position: 'absolute', top: 8, left: 10, fontSize: 10.5, letterSpacing: 1, fontWeight: 800, color: 'rgba(125,249,255,.6)' }}>PROFESSOR BYTE</div>
      </div>

      {/* speech bubble */}
      <div style={{ position: 'relative', marginTop: 10, padding: '10px 12px', borderRadius: 14, background: 'var(--card-2)', border: '1px solid var(--border)', minHeight: 46 }}>
        <div style={{ position: 'absolute', top: -7, left: 44, width: 12, height: 12, background: 'var(--card-2)', borderLeft: '1px solid var(--border)', borderTop: '1px solid var(--border)', transform: 'rotate(45deg)' }} />
        {thinking ? <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Hmm… let me think about that…</div> : <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{bubble}</div>}
        {live && <div style={{ marginTop: 8, fontSize: 12.5, color: heard ? 'var(--green)' : 'var(--text-3)', display: 'flex', gap: 6, alignItems: 'center' }}><motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity }} style={{ width: 8, height: 8, borderRadius: 4, background: '#EF4444', display: 'inline-block' }} />{heard ? `You: ${heard}` : talking ? 'Listening. Talk over him to interrupt.' : 'Your turn. Answer out loud.'}</div>}
        {answer && answer.scenes.length > 1 && <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>{answer.scenes.map((_, k) => <span key={k} style={{ flex: 1, height: 3, borderRadius: 2, background: k <= (cur?.s ?? 0) ? '#34D399' : 'var(--border)' }} />)}</div>}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {cur && !cur.done && <button className="btn-ghost" onClick={() => play(cur.i, cur.s + 1)}>⏭ Skip</button>}
        {answer && <button className="btn-ghost" onClick={() => play(cur.i, 0)}>↺ Replay</button>}
        {live && talking && <button className="btn-primary" onClick={() => interrupt()}>✋ Interrupt</button>}
        {live && heard && !talking && <button className="btn-primary" onClick={submitHeard}>➤ Send answer</button>}
        {lastAi && <button className="btn-ghost" onClick={() => { onSaveNote({ title: `Byte on ${subject}`.slice(0, 80), body: toMd(lastAi), course_id: courseId || null }); lastAi.saved = true; setLog((l) => [...l]); }}>{lastAi.saved ? '✓ Saved' : '📝 Save lesson'}</button>}
      </div>

      <button className={live ? 'btn-ghost' : 'btn-primary'} style={{ width: '100%', marginTop: 10, padding: 12 }} onClick={() => (live ? stopLive() : startLive())}>{live ? '⏹ End live class' : '🎙 Start a live class (talk to him)'}</button>
      {liveErr && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{liveErr}</div>}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>His voice:</span>
        {BYTE_VOICES.map(([k, l]) => <button key={k} className={`chip ${voice === k ? 'active' : ''}`} style={{ fontSize: 11.5, padding: '3px 9px' }} onClick={() => { setVoice(k); voiceRef.current = k; setByteVoice(k); if (k === 'off') hush(); else if (!talking && !thinking) say(k === 'phone' ? 'This is the phone voice. Bit robotic, right?' : 'Hi. This is my voice now. Better, right?', 'cheeky'); }}>{l}</button>)}
      </div>
      <div className="tab-scroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '10px 0 8px' }}>
        {chips.map((c, k) => <button key={'c' + k} className="chip" style={{ borderColor: 'rgba(52,211,153,.5)' }} disabled={thinking} onClick={() => ask(c)}>{c}</button>)}
        {QUICK.map(([k, l]) => <button key={k} className="chip" disabled={thinking} onClick={() => ask('', k)}>{l}</button>)}
        <button className="chip" disabled={thinking} onClick={() => setQ(`Let me explain ${subject} back to you: `)}>🗣 I'll explain it back</button>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <textarea className="input" rows={2} value={q} onFocus={() => setListening(true)} onBlur={() => setListening(false)} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(q); } }} placeholder={`Ask Byte about ${subject}…`} />
        <button className="btn-primary" disabled={thinking || !q.trim()} onClick={() => ask(q)}>Ask</button>
      </div>

      {log.length > 0 && <button className="btn-ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => setShowLog(!showLog)}>{showLog ? 'Hide' : 'Show'} the class so far ({log.filter((m) => m.role === 'ai').length})</button>}
      {showLog && (
        <div style={{ maxHeight: 380, overflowY: 'auto', marginTop: 8 }}>
          {log.map((m, i) => (
            <div key={i} style={{ margin: '8px 0', display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: '94%', padding: '9px 11px', borderRadius: 12, background: m.role === 'user' ? 'var(--green-dim)' : 'var(--card-2)', border: '1px solid var(--border)' }}>
                {m.role === 'user' ? <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{m.text}</div> : <Md text={toMd(m)} />}
                {m.role === 'ai' && !m.error && <button style={{ background: 'none', border: 0, color: 'var(--text-3)', fontSize: 11.5, padding: 0, marginTop: 4, cursor: 'pointer' }} onClick={() => play(i, 0)}>▶ Watch again</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
