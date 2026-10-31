import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ProfessorByte from './ProfessorByte';
import TutorBoard, { boardToMd } from './TutorBoard';
import Md from './Md';
import { askStudy } from '../../lib/study';
import { speak, stopSpeaking, pickByteVoice } from '../../lib/voice';

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
const VKEY = 'luxe_byte_voice';

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
  const [cur, setCur] = useState(null); // { i, s } the scene being played
  const [talking, setTalking] = useState(false);
  const [typed, setTyped] = useState('');
  const [thinking, setThinking] = useState(false);
  const [q, setQ] = useState('');
  const [voiceOn, setVoiceOn] = useState(true);
  const [idle, setIdle] = useState(null); // { gesture, mood, line }
  const [ripples, setRipples] = useState([]);
  const [showLog, setShowLog] = useState(false);
  const [listening, setListening] = useState(false);
  const timers = useRef([]);
  const playId = useRef(0);
  const logRef = useRef(log); logRef.current = log;
  const voiceRef = useRef(true); voiceRef.current = voiceOn;
  const started = useRef(false);

  useEffect(() => { try { setVoiceOn(localStorage.getItem(VKEY) !== 'off'); } catch { /* private mode */ } }, []);
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.current.push(t); return t; };
  useEffect(() => () => { clearTimers(); stopSpeaking(); }, []);

  const knock = useCallback(() => {
    tok();
    const id = Math.random();
    setRipples((r) => [...r.slice(-3), id]);
    setTimeout(() => setRipples((r) => r.filter((x) => x !== id)), 900);
  }, []);

  // Plays scene s of answer i, then moves on by itself.
  const play = useCallback((i, s) => {
    const a = logRef.current[i];
    clearTimers(); stopSpeaking();
    if (!a?.scenes?.[s]) { setCur((c) => (c ? { ...c, done: true } : c)); setTalking(false); return; }
    const id = ++playId.current;
    const scene = a.scenes[s];
    setIdle(null); setCur({ i, s, done: false }); setTalking(true); setTyped('');
    const text = scene.say;
    // Typewriter for the speech bubble.
    let k = 0;
    const type = () => { if (playId.current !== id) return; k = Math.min(text.length, k + 2); setTyped(text.slice(0, k)); if (k < text.length) later(type, 28); };
    type();
    let finished = false;
    const next = () => {
      if (finished || playId.current !== id) return; finished = true;
      setTalking(false);
      later(() => { if (playId.current === id) play(i, s + 1); }, 650);
    };
    const words = text.split(/\s+/).length;
    if (voiceRef.current && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      let began = false;
      speak(text, { voice: pickByteVoice(), rate: 1.06, pitch: 1.12, onStart: () => { began = true; }, onEnd: next });
      later(() => { if (!began && !finished) { stopSpeaking(); later(next, Math.max(1500, words * 330)); } }, 1800); // the phone wouldn't speak: read it silently
      later(next, words * 520 + 4000); // safety net
    } else later(next, Math.max(2600, words * 330 + 900));
  }, []);

  const ask = useCallback(async (question, level) => {
    if (thinking) return;
    const userText = level ? QUICK.find(([k]) => k === level)?.[1].replace(/^\S+\s/, '') || '' : String(question || '').trim();
    if (!level && !userText) return;
    clearTimers(); stopSpeaking(); setTalking(false); setIdle(null);
    const history = logRef.current.map((m) => ({ role: m.role, text: m.role === 'ai' ? m.scenes.map((s) => s.say).join(' ') : m.text }));
    if (level !== 'start') setLog((l) => [...l, { role: 'user', text: userText }]);
    setQ(''); setThinking(true);
    try {
      const j = await askStudy({ type: 'stage', level: level || undefined, question: userText, topic: subject, context: context(), history });
      const entry = { role: 'ai', scenes: j.scenes || [], chips: j.chips || [] };
      setLog((l) => { const n = [...l, entry]; logRef.current = n; return n; });
      setThinking(false);
      setTimeout(() => play(logRef.current.length - 1, 0), 60);
    } catch (e) {
      setThinking(false);
      const entry = { role: 'ai', error: true, scenes: [{ say: e.message || 'My circuits tangled. Try again?', mood: 'surprised', gesture: 'shrug', board: null }], chips: [] };
      setLog((l) => { const n = [...l, entry]; logRef.current = n; return n; });
      setTimeout(() => play(logRef.current.length - 1, 0), 60);
    }
  }, [thinking, subject, context, play]);

  // He bursts in the first time you open the tutor.
  // A request from elsewhere in Study mode (e.g. "Teach me this" in Materials) goes first.
  const handled = useRef(null);
  useEffect(() => {
    if (!active) return;
    if (request && request.n !== handled.current) { handled.current = request.n; started.current = true; ask('', request.level); return; }
    if (!started.current) { started.current = true; ask('', 'start'); }
  }, [active, request?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!active) { clearTimers(); stopSpeaking(); setTalking(false); setCur((c) => (c ? { ...c, done: true } : c)); } }, [active]);

  // Idle antics while you read or think.
  useEffect(() => {
    if (!active || talking || thinking) return undefined;
    const t = setTimeout(() => {
      const pick = [['knock', 'cheeky'], ['wave', 'happy'], ['lean', 'cheeky'], ['shrug', 'happy'], ['laugh', 'cheeky']][Math.floor(Math.random() * 5)];
      setIdle({ gesture: pick[0], mood: pick[1], line: IDLE[Math.floor(Math.random() * IDLE.length)] });
      setTimeout(() => setIdle((x) => (x ? { ...x, gesture: 'none' } : x)), 2600);
    }, 35000 + Math.random() * 25000);
    return () => clearTimeout(t);
  }, [active, talking, thinking, idle, log.length]);

  const poke = () => {
    if (talking || thinking) return;
    setIdle({ gesture: Math.random() < 0.5 ? 'laugh' : 'shrug', mood: 'cheeky', line: POKES[Math.floor(Math.random() * POKES.length)] });
    setTimeout(() => setIdle((x) => (x ? { ...x, gesture: 'none' } : x)), 1800);
  };

  const answer = cur ? log[cur.i] : null;
  const scene = answer?.scenes?.[cur.s] || answer?.scenes?.[answer.scenes.length - 1] || null;
  // The board stays up until a later scene replaces it.
  const board = answer ? [...answer.scenes.slice(0, (cur?.s ?? 0) + 1)].reverse().find((x) => x.board)?.board || null : null;
  const boardKey = answer ? `${cur.i}-${answer.scenes.findIndex((x) => x.board === board)}` : 'none';
  const mood = idle?.mood || (listening ? 'happy' : scene?.mood) || 'happy';
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
          <ProfessorByte size={board ? 118 : 150} mood={mood} gesture={gesture} talking={talking} thinking={thinking} look={board && talking ? { x: 0.9, y: -0.2 } : listening ? { x: 0, y: 0.9 } : null} onKnock={knock} />
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
        {answer && answer.scenes.length > 1 && <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>{answer.scenes.map((_, k) => <span key={k} style={{ flex: 1, height: 3, borderRadius: 2, background: k <= (cur?.s ?? 0) ? '#34D399' : 'var(--border)' }} />)}</div>}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {cur && !cur.done && <button className="btn-ghost" onClick={() => play(cur.i, cur.s + 1)}>⏭ Skip</button>}
        {answer && <button className="btn-ghost" onClick={() => play(cur.i, 0)}>↺ Replay</button>}
        <button className="btn-ghost" onClick={() => { const v = !voiceOn; setVoiceOn(v); try { localStorage.setItem(VKEY, v ? 'on' : 'off'); } catch { /* private */ } if (!v) stopSpeaking(); }}>{voiceOn ? '🔊 Voice on' : '🔇 Voice off'}</button>
        {lastAi && <button className="btn-ghost" onClick={() => { onSaveNote({ title: `Byte on ${subject}`.slice(0, 80), body: toMd(lastAi), course_id: courseId || null }); lastAi.saved = true; setLog((l) => [...l]); }}>{lastAi.saved ? '✓ Saved' : '📝 Save lesson'}</button>}
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
