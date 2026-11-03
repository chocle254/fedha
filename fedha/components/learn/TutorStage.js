import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ProfessorByte from './ProfessorByte';
import TutorBoard, { boardToMd } from './TutorBoard';
import Md from './Md';
import CodePad from './CodePad';
import { resizeImage } from '../../lib/utils';
import { askStudy, getSass, setSass } from '../../lib/study';
import { stopSpeaking } from '../../lib/voice';
import { speakByte, warmByte, byteVoiceInfo, byteVoiceWhy, getByteVoice, setByteVoice, BYTE_VOICES } from '../../lib/byte-voice';

// The tutor stage in Study mode. Professor Byte runs a class: he teaches the lesson point by point (the next part is
// prepared while he talks, and the words stay off screen unless captions are on), then quizzes you at the end. He only
// waits for you when he asks a question: a clue after 20 s, then the answer explained simply 20 s later.
// He stands behind the glass and acts each answer out as scenes:
// he says a line (out loud if voice is on), with a mood and a gesture, and puts a chart, steps, code, a story
// and so on up on his board. Between answers he idles like he's alive: looks around, knocks on the glass,
// reacts when you poke him. Every answer can be saved as a note (spoken lines plus boards, as Markdown).
const QUICK = [
  ['simple', '🧒 Simply'], ['normal', '💡 Explain'], ['deep', '🔬 Go deep'], ['example', '🧪 Examples'],
  ['mistakes', '⚠️ Mistakes'], ['story', '📜 Story time'], ['quiz', '❓ Quiz me'],
];
const POKES = ['Hey! That tickles.', 'Careful, this glass is not cheap.', 'Yes, I am real. Mostly.', 'Poke me again and I give you homework.', 'I felt that in my circuits.', 'Ooh, attention. I like it.'];
const IDLE = ['Still with me?', 'I live here, you know. I can wait.', 'Psst. Ask me something. I get bored.', 'Fun fact: I never sleep. Do you?', 'Tap Quiz me when you feel ready.'];
// Quick-button answers are kept (last 60) so the same lesson + button replays instantly; "↻ New take" refreshes.
const AKEY = 'luxe_byte_answers';
const CACHEABLE = ['simple', 'normal', 'deep', 'example', 'mistakes', 'story'];
const readAnswers = () => { try { return JSON.parse(localStorage.getItem(AKEY) || '{}'); } catch { return {}; } };
function saveAnswer(k, entry) {
  try {
    const a = readAnswers(); a[k] = { scenes: entry.scenes, chips: entry.chips, at: Date.now() };
    const keep = Object.entries(a).sort((x, y) => y[1].at - x[1].at).slice(0, 60);
    localStorage.setItem(AKEY, JSON.stringify(Object.fromEntries(keep)));
  } catch { /* storage full */ }
}
const CUTS = ['Oh, interrupting the professor? Bold. Go on.', 'Whoa, okay, you talk. I am listening.', 'Rude. But I like the energy. Go.', 'Mid-sentence? Fine. Your turn.'];
const HINT_LEADS = ['Tick tock. Here is a clue.', 'Take your time. Actually, hurry. Clue incoming.', 'Hello? Okay, a little help.', 'Still thinking? Here, a clue.'];
const TIMEUP = ['Time is up, my friend. Here is the answer.', 'Okay, I will rescue you. Listen closely.', 'No answer? No problem. Here it is.'];
const QUIZ_INTRO = ['That is the whole lesson. Now a short quiz to lock it in. Answer out loud or type it.', 'Lesson done. Quiz time, nothing scary. Answer out loud or type it.', 'And that is everything. Let us see what stuck. Answer out loud or type it.'];
const HINT_AT = 20000; // silence after his question before he gives a clue
const REVEAL_GAP = 20000; // more silence after the clue before he answers and explains it simply
const pick = (a) => a[Math.floor(Math.random() * a.length)];
// Savage mode (the sass dial): the same moments, with rage-bait. Roasts the mistake, never the person.
const SAVAGE = {
  CUTS: ['Interrupting a professor mid-genius? Bold. This better be good.', 'Oh, you have something to say? The floor is yours. Impress me.', 'Cutting me off? Fine. Let us see if it was worth it.'],
  HINT_LEADS: ['Still nothing? Wow. Fine, here is a clue, since you clearly need one.', 'I could hear the gears grinding from here. Clue.', 'Tick tock. My toaster answered this faster. Clue incoming.'],
  TIMEUP: ['Time is up. I will just do it myself, as usual.', 'Silence. Bold strategy. Here is the answer.', 'Nothing? Okay. Watch and learn.'],
  POKES: ['Poking the professor? Answer a question instead, coward.', 'I felt that. My lawyer will be in touch.', 'Tap me again and I start teaching calculus.', 'You poke, I quiz. That is the deal.'],
  QUIZ_INTRO: ['Lesson over. Now we find out if you were actually listening. Answer out loud or type it.', 'Quiz time. Let us see how much of my brilliance survived. Answer out loud or type it.', 'And now the moment of truth. Prove you were not just nodding. Answer out loud or type it.'],
};
// Walking in on Byte: when the tutor opens, he is caught in the middle of something weird, notices you, and pulls
// himself together. A different one each time (no AI needed, so it starts instantly). prop = the effect around him.
const SKITS = [
  { id: 'hum', prop: 'notes', scenes: [['Hmm hmm hmmm. Hmm hm hmmm. Hmm hmm hmm hmmmm.', 'happy', 'none'], ['Oh! You are here. I was not humming. That was the fridge.', 'surprised', 'shrug']] },
  { id: 'sing', prop: 'notes', scenes: [['Gradient descent, take me down, to the minimum, of this town. Oh yeah.', 'excited', 'celebrate'], ['How long have you been standing there? Do not answer that. Class is starting.', 'surprised', 'facepalm']] },
  { id: 'crisis', prop: 'cloud', scenes: [['If I explain something and nobody listens, did I even teach?', 'serious', 'think'], ['Am I just a bunch of if-statements wearing a hat?', 'thinking', 'shrug'], ['Oh. Hi. Ignore that. Professors have feelings too. Let us learn something.', 'surprised', 'wave']] },
  { id: 'nap', prop: 'zzz', scenes: [['Zzz. Five more minutes. The gradient. Is. Vanishing. Zzz.', 'thinking', 'none'], ['Huh? I was not asleep. I was buffering. Totally different.', 'surprised', 'shrug']] },
  { id: 'pushups', prop: 'sweat', scenes: [['Ninety eight. Ninety nine. One hundred.', 'serious', 'lean'], ['That was two push-ups. Robots count in binary. Anyway, welcome.', 'proud', 'celebrate']] },
  { id: 'plant', prop: 'leaf', scenes: [['Listen, Gerald. Photosynthesis is just a solar-powered data pipeline. You are basically a data centre with leaves.', 'happy', 'explain'], ['Oh, you are here. Gerald is my best student. Do not tell him I said that.', 'cheeky', 'wave']] },
  { id: 'mirror', prop: null, scenes: [['No, YOU are the better professor. No, you are. No, YOU are.', 'cheeky', 'point'], ['Ahem. I was calibrating my reflection. Very important robot maintenance.', 'surprised', 'shrug']] },
  { id: 'battery', prop: 'crumbs', scenes: [['Mmm. Double A. Crunchy on the outside, lithium on the inside.', 'happy', 'laugh'], ['Want a bite? No? More for me. Okay, lesson time.', 'cheeky', 'wave']] },
  { id: 'poem', prop: null, scenes: [['Roses are red, my LEDs are blue, I have a stack overflow, and soon so will you.', 'proud', 'explain'], ['Thank you, thank you. I will be here all week. Mostly because I live here.', 'cheeky', 'celebrate']] },
  { id: 'segfault', prop: 'cloud', scenes: [['Segmentation fault. Core dumped. Why does it always end like this?', 'serious', 'facepalm'], ['Oh! Sorry. I was reading old error logs. It is like a sad movie for robots. Let us cheer up and learn.', 'surprised', 'shrug']] },
  { id: 'villain', prop: null, scenes: [['Mwahaha. No. MWAHAHAHA. Yes, much more evil.', 'excited', 'laugh'], ['That is for when you get every answer right. Then I will have no one to roast. Let us begin.', 'cheeky', 'lean']] },
  { id: 'password', prop: null, scenes: [['Was it password one two three? Password one two three four? Why do I even have a password? I am a drawing.', 'thinking', 'think'], ['Never mind. Hi! Cybersecurity lesson number one: do not be me.', 'cheeky', 'wave']] },
  { id: 'dance', prop: 'notes', scenes: [['Left, right, recursion, recursion, recursion, recursion.', 'excited', 'celebrate'], ['I would explain this dance, but it never terminates. Let us do something easier: today\'s lesson.', 'cheeky', 'shrug']] },
  { id: 'cloud', prop: null, scenes: [['Do you think the cloud knows it is just someone else\'s computer?', 'thinking', 'think'], ['Deep thoughts. Anyway. Hello, you. Sit down, we have work to do.', 'happy', 'wave']] },
  { id: 'rehearse', prop: null, scenes: [['And THAT, ladies and gentlemen, is why you never trust an unvalidated input. Thank you. Thank you. No autographs.', 'proud', 'celebrate'], ['Oh. It is just you. I was rehearsing for my fans. You will do.', 'cheeky', 'shrug']] },
];
function nextSkit() {
  let last = '';
  try { last = localStorage.getItem('luxe_byte_skit') || ''; } catch { /* private */ }
  const pool = SKITS.filter((k) => k.id !== last);
  const k = pool[Math.floor(Math.random() * pool.length)];
  try { localStorage.setItem('luxe_byte_skit', k.id); } catch { /* private */ }
  return k;
}
const L = (name, normal) => (getSass() === 'savage' ? SAVAGE[name] : normal);
const WHO = { eleven: 'ElevenLabs', troy: 'Troy', austin: 'Austin', daniel: 'Daniel', phone: 'the phone voice' };

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

// Lesson plans he made, kept on this phone (last 20) so reopening the same lesson picks up where you left off.
const PKEY = 'luxe_byte_plans';
const loadPlans = () => { try { return JSON.parse(localStorage.getItem(PKEY) || '{}'); } catch { return {}; } };
function savePlan(key, v) {
  try {
    const all = loadPlans(); all[key] = { ...v, at: Date.now() };
    const keep = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, 20);
    localStorage.setItem(PKEY, JSON.stringify(Object.fromEntries(keep)));
  } catch { /* storage full or private */ }
}

export default function TutorStage({ pomo, prepare, active, subject, context, brief, planKey, onSaveNote, courseId, request, homework, onSetHomework, onGradeHomework }) {
  const [log, setLog] = useState([]);
  const [plan, setPlan] = useState(null); // { title, opener, known, weak, steps, step, sig }
  const [reading, setReading] = useState(null); // what he is reading right now
  const [showPlan, setShowPlan] = useState(false);
  const planRef = useRef(null); planRef.current = plan;
  const [hwOpen, setHwOpen] = useState(false); // the hand-in card
  const [hwText, setHwText] = useState('');
  const [hwSet, setHwSet] = useState(null); // homework he just set
  const [hwVerdict, setHwVerdict] = useState(null);
  const hwChecked = useRef(false);
  const afterRef = useRef(null); // what to do once the current answer has played
  const sig = useRef({ pasted: 0, typed: 0, first: 0 });
  const hwRef = useRef(homework); hwRef.current = homework;
  const hwOpenRef = useRef(false); hwOpenRef.current = hwOpen;
  const [cur, setCur] = useState(null); // { i, s, done } the scene being played
  const [talking, setTalking] = useState(false);
  const [level, setLevel] = useState(0); // loudness of his voice, for the mouth
  const [typed, setTyped] = useState('');
  const [thinking, setThinking] = useState(false);
  const [q, setQ] = useState('');
  const [voice, setVoice] = useState('auto');
  const [sass, setSassState] = useState('savage');
  const [skitProp, setSkitProp] = useState(null);
  const skitNext = useRef(null);
  useEffect(() => { setSassState(getSass()); }, []);
  const [idle, setIdle] = useState(null); // { gesture, mood, line }
  const [ripples, setRipples] = useState([]);
  const [showLog, setShowLog] = useState(false);
  const [listening, setListening] = useState(false);
  const [live, setLive] = useState(false);
  const [heard, setHeard] = useState('');
  const [liveErr, setLiveErr] = useState('');
  const [mic, setMic] = useState('off'); // off | listening | idle (your turn, tap to answer)
  const [turn, setTurn] = useState('byte'); // whose turn it is: 'you' only when he is waiting for your answer
  const micTries = useRef(0);
  const timers = useRef([]);
  const waitTimers = useRef([]);
  const playId = useRef(0);
  const speaker = useRef(null);
  const logRef = useRef(log); logRef.current = log;
  const voiceRef = useRef('auto'); voiceRef.current = voice;
  const liveRef = useRef(false); liveRef.current = live;
  const talkingRef = useRef(false); talkingRef.current = talking;
  const thinkingRef = useRef(false); thinkingRef.current = thinking;
  const saying = useRef(''); // what he is saying right now (to tell his own echo from you)
  const sayStart = useRef(0);
  const rec = useRef(null);
  const said = useRef(''); // your words so far this turn
  const endT = useRef(null);
  const cutOff = useRef(''); // what he was saying when you interrupted
  const started = useRef(false);

  const [captions, setCaptions] = useState(false); // his words on screen (off by default: he talks, you listen)
  const [classOn, setClassOn] = useState(false);
  const [paused, setPaused] = useState(false);
  const [quizUi, setQuizUi] = useState(null); // { i, n, waiting }
  const [codeOpen, setCodeOpen] = useState(false); // the code editor (coding classes)
  const [hwImgs, setHwImgs] = useState([]); // homework photos
  const captionsRef = useRef(false); captionsRef.current = captions;
  const curRef = useRef(null); curRef.current = cur;
  const planKeyRef = useRef(planKey); planKeyRef.current = planKey;
  // The class: on, paused, what to do when carried on (pending), where to pick up after a question (resumeFn), the quiz in progress.
  const pomoRef = useRef(pomo); pomoRef.current = pomo;
  const cls = useRef({ on: false, paused: false, pending: null, resumeFn: null, quiz: null, step: 0 });
  const pre = useRef({}); // parts of the lesson fetched ahead of time (promises)
  const preVal = useRef({}); // the same parts once they have arrived
  const lectureSaid = useRef({}); // what he said in each part (per lesson), so the next part carries on from it
  const quizPack = useRef(null);
  const lastQuiz = useRef('');
  const rearm = useRef(null);
  const K = useRef({}); // latest versions of the class functions, for timers and the stable play()
  useEffect(() => { setVoice(getByteVoice()); try { setCaptions(localStorage.getItem('luxe_byte_cc') === '1'); } catch { /* private mode */ } }, []);
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const clearWait = () => { waitTimers.current.forEach(clearTimeout); waitTimers.current = []; };
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.current.push(t); return t; };
  const hush = () => { speaker.current?.stop(); speaker.current = null; stopSpeaking(); setLevel(0); };
  useEffect(() => () => { cls.current.on = false; clearTimers(); clearWait(); clearTimeout(rearm.current); hush(); stopLive(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const knock = useCallback(() => {
    tok();
    const id = Math.random();
    setRipples((r) => [...r.slice(-3), id]);
    setTimeout(() => setRipples((r) => r.filter((x) => x !== id)), 900);
  }, []);

  // Says one line in his voice; calls done() when finished (or after a safety timeout).
  const say = (text, mood, done) => {
    hush();
    micOff(); setTurn('byte'); // the mic never listens while he talks (it would hear him)
    saying.current = text; sayStart.current = Date.now();
    let finished = false;
    const fin = () => { if (finished) return; finished = true; speaker.current = null; setLevel(0); done?.(); };
    const words = text.split(/\s+/).length;
    if (voiceRef.current === 'off') { later(fin, Math.max(2600, words * 330 + 900)); return; }
    speaker.current = speakByte(text, { mood, voice: voiceRef.current, onLevel: setLevel, onEnd: fin });
    later(fin, words * 650 + 9000); // safety net if audio never reports the end
  };

  // Plays scene s of answer i, then moves on by itself. When the answer ends, the class decides what comes next.
  const play = useCallback((i, s) => {
    const a = logRef.current[i];
    clearTimers(); hush();
    if (!a?.scenes?.[s]) {
      setCur((c) => (c ? { ...c, done: true } : c)); setTalking(false); saying.current = '';
      if (afterRef.current) { const next = afterRef.current; afterRef.current = null; later(() => askRef.current('', next), 900); return; }
      K.current.entryEnded?.(a, i);
      return;
    }
    const id = ++playId.current;
    const scene = a.scenes[s];
    setIdle(null); setCur({ i, s, done: false }); setTalking(true); setTyped('');
    // Get the next line's voice ready while this one plays, so there is no gap between lines.
    const nxt = a.scenes[s + 1] || (a.kind === 'lecture' ? preVal.current[K.current.stepKey(planRef.current, a.step + 1)]?.scenes?.[0] : null);
    if (nxt) warmByte(nxt.say, { mood: nxt.mood, voice: voiceRef.current });
    const text = scene.say;
    // The words only appear on screen when captions are on (or his voice is off): he talks, you listen.
    if (captionsRef.current || voiceRef.current === 'off') {
      let k = 0;
      const type = () => { if (playId.current !== id) return; k = Math.min(text.length, k + 2); setTyped(text.slice(0, k)); if (k < text.length) later(type, 30); };
      type();
    }
    const goNext = () => {
      if (playId.current !== id) return;
      const c = cls.current;
      if (c.on && c.paused && !a.free) { c.pending = () => play(i, s + 1); return; }
      play(i, s + 1);
    };
    say(text, scene.mood, () => { if (playId.current !== id) return; setTalking(false); later(goNext, 550); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const showEntry = (entry) => { setLog((l) => { const n = [...l, entry]; logRef.current = n; return n; }); setTimeout(() => play(logRef.current.length - 1, 0), 60); };
  const gate = (fn) => { const c = cls.current; if (c.on && c.paused) c.pending = fn; else fn(); };
  const proceed = (fn) => later(() => gate(fn), 700);
  const oneScene = (say, mood = 'happy', gesture = 'none', board = null) => [{ say, mood, gesture, board }];

  // ── The class: he lectures point by point, then quizzes you at the end ──
  // Each part of the lesson is fetched while the part before it is still being taught, so there is no waiting between parts.
  const fetchStep = (p, k, intro) => {
    const key = K.current.stepKey(p, k);
    if (pre.current[key]) return pre.current[key];
    const history = [k - 2, k - 1].filter((x) => x >= 0 && lectureSaid.current[K.current.stepKey(p, x)]).map((x) => ({ role: 'ai', text: lectureSaid.current[K.current.stepKey(p, x)] }));
    const job = askStudy({ type: 'stage', level: 'teach', intro, topic: subject, context: context(), plan: { steps: p.steps, mode: p.mode, lang: p.lang, pipeline: p.pipeline }, step: k, history })
      .then((j) => {
        const scenes = j.scenes || [];
        if (!scenes.length) throw new Error('empty');
        lectureSaid.current[key] = scenes.map((x) => x.say).join(' ');
        preVal.current[key] = { scenes };
        return { scenes };
      })
      .catch((e) => { delete pre.current[key]; throw e; });
    pre.current[key] = job;
    return job;
  };
  // The end-of-lesson quiz is written in one go (question, clue, answer and a simpler answer), also while he teaches.
  const fetchQuiz = (p) => {
    const key = K.current.stepKey(p, 'quiz');
    if (quizPack.current?.key !== key) {
      const job = askStudy({ type: 'quiz_pack', topic: subject, context: context(), plan: { steps: p.steps } })
        .then((j) => j.questions).catch(() => { if (quizPack.current?.job === job) quizPack.current = null; return null; });
      quizPack.current = { key, job };
    }
    return quizPack.current.job;
  };
  const fallbackQuiz = (p) => p.steps.map((st) => ({ ask: st.check || `In your own words, what is ${st.title}?`, hint: `Think about this: ${st.goal}.`, answer: st.goal, simple: `In simple words: ${st.goal}.` }));

  const beginClass = async (opts = {}) => {
    const c = cls.current;
    clearTimers(); clearWait(); hush(); playId.current++; setTalking(false); setIdle(null);
    c.on = true; c.paused = false; c.pending = null; c.resumeFn = null; c.quiz = null; c.step = 0;
    setClassOn(true); setPaused(false); setQuizUi(null);
    setThinking(true); thinkingRef.current = true;
    let p = null;
    try { p = await ensurePlan(); } catch { p = null; }
    setThinking(false); thinkingRef.current = false;
    if (!c.on) return;
    if (!p) {
      c.on = false; setClassOn(false);
      showEntry({ role: 'ai', kind: 'misc', error: true, scenes: oneScene('I could not get your lesson ready, the free AI is busy. Give it a minute, then tap Start class.', 'surprised', 'shrug'), chips: [] });
      return;
    }
    const k = opts.from != null ? opts.from : p.step >= p.steps.length ? -1 : p.step;
    if (k < 0) { startQuiz({ revision: true }); return; }
    teachStep(k, k === 0 ? 'new' : opts.from != null ? 'jump' : 'back');
  };

  const teachStep = async (k, intro) => {
    const c = cls.current; const p = planRef.current;
    if (!c.on || !p || !p.steps[k]) return;
    c.step = k;
    if (!preVal.current[K.current.stepKey(p, k)]) { setThinking(true); thinkingRef.current = true; }
    let entry;
    try { entry = await fetchStep(p, k, intro); }
    catch {
      setThinking(false); thinkingRef.current = false;
      if (!c.on) return;
      c.paused = true; setPaused(true); c.pending = () => teachStep(k, intro);
      showEntry({ role: 'ai', kind: 'misc', error: true, scenes: oneScene('The free AI is busy and my notes got stuck. Tap Carry on and I will try again.', 'surprised', 'shrug'), chips: [] });
      return;
    }
    setThinking(false); thinkingRef.current = false;
    if (!c.on || c.step !== k) return;
    gate(() => {
      showEntry({ role: 'ai', kind: 'lecture', step: k, scenes: entry.scenes, chips: [] });
      if (k + 1 < p.steps.length) fetchStep(p, k + 1).catch(() => {});
      fetchQuiz(p);
    });
  };

  const lectureDone = (k) => {
    const c = cls.current; const p = planRef.current;
    if (!c.on || !p) return;
    proceed(() => startCheck(k));
  };
  // After the check: the next part, or (coding classes) your turn to code, then the quiz.
  const afterCheck = (k) => {
    const c = cls.current; const p = planRef.current;
    if (!c.on || !p) return;
    const next = { ...p, step: Math.max(p.step, k + 1) }; setPlan(next); planRef.current = next; savePlan(planKey, next);
    if (k + 1 < p.steps.length) { holdForBreak(() => teachStep(k + 1), p.steps[k + 1].title); return; }
    if (p.mode === 'coding' && !c.coded) {
      c.coded = true;
      showEntry({ role: 'ai', kind: 'misc', free: true, scenes: oneScene('Now the real test of a coder: you write it yourself. I put an exercise in the editor below. Run it, then hand it to me and I will review it line by line. When you are done, close the editor and we do the quiz.', 'excited', 'point'), chips: [] });
      setCodeOpen(true); c.pending = () => startQuiz(); c.paused = true; setPaused(true);
      return;
    }
    holdForBreak(() => startQuiz(), 'the quiz');
  };
  // A check question after every part: he only moves on once you have got it (or he has explained it twice).
  const startCheck = (k) => {
    const c = cls.current; const p = planRef.current;
    if (!c.on || !p?.steps[k]) return;
    const st = p.steps[k];
    if (!st.check) { afterCheck(k); return; }
    const q = { i: -1, right: 0, partial: 0, wrong: 0, missed: [], waiting: false, hinted: false, check: true, step: k, tries: 0, list: [{ ask: st.check, answer: st.answer || st.goal, hint: `Think about what we just said: ${st.goal}.`, simple: st.answer || st.goal }] };
    c.quiz = q;
    nextQuestion();
  };
  // Pomodoro: if the focus block is about to end, stop at this natural break instead of starting the next part.
  const holdForBreak = (fn, what) => {
    const c = cls.current; const f = pomoRef.current;
    if (f?.phase === 'focus' && f.endAt && f.endAt - Date.now() < 100000) {
      c.paused = true; setPaused(true); c.pending = fn;
      showEntry({ role: 'ai', kind: 'misc', free: true, scenes: oneScene(`That is a perfect place to stop. Your break starts in a moment. When you are back, we carry on with ${what}.`, 'happy', 'wave'), chips: [] });
      return;
    }
    proceed(fn);
  };

  // ── The quiz: he asks, you answer. Slow? A clue. Slower still? He answers and explains it simply. ──
  const startQuiz = async (opts = {}) => {
    const c = cls.current; const p = planRef.current;
    if (!p) return;
    clearTimers(); clearWait(); hush(); playId.current++; setTalking(false); setIdle(null);
    c.on = true; c.paused = false; c.pending = null; c.resumeFn = null; setClassOn(true); setPaused(false);
    const q = { i: -1, right: 0, partial: 0, wrong: 0, missed: [], waiting: false, hinted: false, list: [], early: !!opts.early };
    c.quiz = q;
    setThinking(true); thinkingRef.current = true;
    let list = null;
    try { list = await fetchQuiz(p); } catch { list = null; }
    setThinking(false); thinkingRef.current = false;
    if (!c.on || c.quiz !== q) return;
    const taught = opts.revision ? p.steps.length : Math.max(1, Math.min(p.steps.length, p.step));
    q.list = (list && list.length ? list : fallbackQuiz(p)).slice(0, taught);
    const intro = opts.early ? 'Quiz time, as you asked. Answer out loud or type it.'
      : opts.revision ? 'You finished this lesson last time, so let us see what stuck. Quick quiz. Answer out loud or type it.'
      : pick(L('QUIZ_INTRO', QUIZ_INTRO));
    gate(() => showEntry({ role: 'ai', kind: 'quizin', scenes: oneScene(intro, 'excited', 'celebrate', { type: 'big', text: 'Quiz time', sub: `${q.list.length} question${q.list.length === 1 ? '' : 's'}` }), chips: [] }));
  };

  const nextQuestion = () => {
    const c = cls.current; const q = c.quiz;
    if (!c.on || !q) return;
    q.i += 1;
    if (q.i >= q.list.length) { finishQuiz(); return; }
    const item = q.list[q.i];
    q.hinted = false; q.waiting = true; q.timeup = '';
    q.board = { type: 'big', text: `Question ${q.i + 1} of ${q.list.length}`, sub: item.ask };
    setQuizUi({ i: q.i, n: q.list.length, waiting: true, check: q.check, part: q.step });
    if (q.check) q.board = { type: 'big', text: q.tries ? 'Try again' : 'Quick check', sub: item.ask };
    const line = q.check ? (q.tries ? `Let us try that again. ${item.ask}` : `Quick check before we move on. ${item.ask}`) : `Question ${q.i + 1}. ${item.ask}`;
    gate(() => showEntry({ role: 'ai', kind: 'quizq', scenes: oneScene(line, 'thinking', 'lean', q.board), chips: [] }));
    const after = q.list[q.i + 1];
    if (after) warmByte(`Question ${q.i + 2}. ${after.ask}`, { mood: 'thinking', voice: voiceRef.current });
  };

  const giveHint = () => {
    const c = cls.current; const q = c.quiz;
    if (!c.on || !q?.waiting || q.hinted) return;
    q.hinted = true;
    const item = q.list[q.i];
    showEntry({ role: 'ai', kind: 'quizhint', scenes: oneScene(`${pick(L('HINT_LEADS', HINT_LEADS))} ${item.hint || 'Think back to what we covered a minute ago.'}`, 'impatient', 'tap', q.board), chips: [] });
  };

  // Out of time or "I don't know": the answer, then the same thing in simpler words.
  const reveal = () => {
    const c = cls.current; const q = c.quiz;
    if (!c.on || !q?.waiting) return;
    q.waiting = false; clearWait(); setQuizUi((u) => u && { ...u, waiting: false });
    q.wrong += 1;
    const item = q.list[q.i];
    q.missed.push(item.ask);
    playId.current++; hush(); setTalking(false);
    showEntry({ role: 'ai', kind: 'quizfb', chips: [], scenes: [
      { say: q.timeup || pick(L('TIMEUP', TIMEUP)), mood: 'serious', gesture: 'explain', board: null },
      { say: item.answer, mood: 'thinking', gesture: 'point', board: { type: 'big', text: 'The answer', sub: item.answer } },
      { say: `Now the simple version. ${item.simple || item.answer}`, mood: 'happy', gesture: 'explain', board: null },
    ] });
  };

  const answerQuiz = async (reply) => {
    const c = cls.current; const q = c.quiz;
    if (!q?.waiting) return;
    q.waiting = false; clearWait(); setQuizUi((u) => u && { ...u, waiting: false });
    playId.current++; clearTimers(); hush(); setTalking(false); setHeard('');
    setLog((l) => { const n = [...l, { role: 'user', text: reply }]; logRef.current = n; return n; });
    setThinking(true); thinkingRef.current = true;
    const item = q.list[q.i];
    let g = null;
    try { g = await askStudy({ type: 'quiz_grade', ask: item.ask, answer: item.answer, reply }); } catch { g = null; }
    setThinking(false); thinkingRef.current = false;
    if (!c.on || c.quiz !== q) return;
    if (!g) g = { verdict: 'partial', say: `I could not mark that one, the free AI is busy. Here is the answer: ${item.answer}`, mood: 'serious' };
    if (g.verdict === 'right') q.right += 1; else if (g.verdict === 'partial') q.partial += 1; else q.wrong += 1;
    if (g.verdict !== 'right') q.missed.push(item.ask);
    if (q.check && g.verdict !== 'right' && q.tries === 0) {
      // Missed the check: he says what was right and what wasn't, re-teaches that piece another way, then asks again.
      q.tries = 1; q.i -= 1;
      const p = planRef.current;
      let re = null;
      setThinking(true); thinkingRef.current = true;
      try { re = await askStudy({ type: 'stage', level: 'reteach', topic: subject, context: context(), plan: { steps: p.steps, mode: p.mode, lang: p.lang, pipeline: p.pipeline }, step: q.step, check: item.ask, answer: item.answer, reply }); } catch { re = null; }
      setThinking(false); thinkingRef.current = false;
      if (!c.on || c.quiz !== q) return;
      const scenes0 = re?.scenes?.length ? re.scenes : [{ say: g.say, mood: g.mood, gesture: 'explain', board: { type: 'big', text: 'Not quite', sub: item.answer } }];
      gate(() => showEntry({ role: 'ai', kind: 'quizfb', scenes: scenes0, chips: [] }));
      return;
    }
    const scenes = [{ say: g.say, mood: g.mood, gesture: g.verdict === 'right' ? 'celebrate' : 'explain', board: g.verdict === 'right' ? null : { type: 'big', text: 'The answer', sub: item.answer } }];
    if (g.verdict === 'wrong') scenes.push({ say: `Simply put: ${item.simple || item.answer}`, mood: 'happy', gesture: 'explain', board: null });
    gate(() => showEntry({ role: 'ai', kind: 'quizfb', scenes, chips: [] }));
  };

  const finishQuiz = () => {
    const c = cls.current; const q = c.quiz; const p = planRef.current;
    if (!q) return;
    if (q.check) { c.quiz = null; setQuizUi(null); if (q.wrong || q.partial) c.weak = [...(c.weak || []), q.list[0].ask].slice(-6); afterCheck(q.step); return; }
    const total = q.list.length;
    lastQuiz.current = `${q.right} of ${total} right${q.partial ? `, ${q.partial} partly right` : ''}${q.missed.length ? `. Missed: ${q.missed.slice(0, 3).join(' | ')}` : ''}`;
    const early = q.early && p && p.step < p.steps.length;
    c.quiz = null; setQuizUi(null);
    gate(() => showEntry({ role: 'ai', kind: early ? 'quizback' : 'quizdone', scenes: oneScene(early ? 'Quiz done for now. Back to the lesson.' : `${pick(['And that is the quiz.', 'Quiz done.', 'That was the last one.'])} Let me add it up.`, 'happy', 'explain', { type: 'big', text: `${q.right} / ${total}`, sub: 'quiz score' }), chips: [] }));
  };

  // Silence after a question: a clue after 20 s, then, 20 s later, the answer. Any typing or talking restarts the clock.
  const waitFor = (ms, fn) => waitTimers.current.push(setTimeout(() => { const c = cls.current; if (!c.quiz?.waiting || c.paused || thinkingRef.current) return; fn(); }, ms));
  const armQuizTimers = () => {
    const c = cls.current; const q = c.quiz;
    if (!c.on || !q?.waiting) return;
    setTurn('you');
    if (c.paused) { c.pending = armQuizTimers; return; }
    clearWait();
    const item = q.list[q.i];
    if (!q.hinted) {
      waitFor(HINT_AT - 4000, () => warmByte(item.hint, { mood: 'impatient', voice: voiceRef.current }));
      waitFor(HINT_AT, giveHint);
    } else {
      q.timeup = q.timeup || pick(L('TIMEUP', TIMEUP));
      waitFor(REVEAL_GAP - 4000, () => { warmByte(q.timeup, { mood: 'serious', voice: voiceRef.current }); warmByte(item.answer, { mood: 'thinking', voice: voiceRef.current }); });
      waitFor(REVEAL_GAP, reveal);
    }
  };
  const onActivity = () => {
    clearWait(); clearTimeout(rearm.current);
    rearm.current = setTimeout(() => { if (cls.current.quiz?.waiting && !thinkingRef.current) armQuizTimers(); }, 6000);
  };

  const pauseClass = () => {
    const c = cls.current;
    if (!c.on || c.paused) return;
    c.paused = true; setPaused(true); clearWait();
    const cu = curRef.current;
    if (cu && !cu.done && talkingRef.current) { playId.current++; clearTimers(); hush(); setTalking(false); c.pending = () => play(cu.i, cu.s); }
  };
  const carryOn = () => {
    const c = cls.current;
    c.paused = false; setPaused(false);
    const f = c.pending; c.pending = null;
    if (f) f();
    else if (c.resumeFn) { const r = c.resumeFn; c.resumeFn = null; r(); }
    else if (c.quiz?.waiting) armQuizTimers();
  };

  // ── Pomodoro: he follows your focus timer ──
  const lastPhase = useRef(pomo?.phase);
  useEffect(() => {
    const ph = pomo?.phase; const prev = lastPhase.current; lastPhase.current = ph;
    const c = cls.current;
    if (!c.on || ph === prev) return;
    if ((ph === 'break' || ph === 'recall') && prev === 'focus') {
      pauseClass();
      showEntry({ role: 'ai', kind: 'misc', free: true, scenes: oneScene(ph === 'recall' ? 'Focus block done, well worked. Do the quick recall, then take your break. I will wait right here.' : 'Break time. Stand up, stretch, drink some water. I will be right here when the timer calls you back.', 'happy', 'wave'), chips: [] });
    } else if (ph === 'focus' && prev && prev !== 'focus' && prev !== 'setup' && c.paused) {
      const p = planRef.current;
      const at = p?.steps?.[Math.min(p.step, p.steps.length - 1)]?.title;
      showEntry({ role: 'ai', kind: 'resume', free: true, scenes: oneScene(`Welcome back. Fresh brain, good. ${at ? `We carry on with ${at}.` : 'Let us carry on.'}`, 'excited', 'wave'), chips: [] });
    }
  }, [pomo?.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  // Pausing the timer pauses him; carrying on with the timer carries him on.
  const lastPaused = useRef(false);
  useEffect(() => {
    const was = lastPaused.current; lastPaused.current = !!pomo?.paused;
    if (!cls.current.on || pomo?.phase !== 'focus') return;
    if (pomo?.paused && !was) pauseClass();
    else if (!pomo?.paused && was && cls.current.paused) carryOn();
  }, [pomo?.paused]); // eslint-disable-line react-hooks/exhaustive-deps

  const quizNow = () => {
    const c = cls.current; const p = planRef.current;
    if (thinkingRef.current || c.quiz) return;
    if (!p || !c.on) { if (!c.on) ask('', 'start'); return; }
    if (p.step < 1) {
      keepPlace(); clearTimers(); hush(); setTalking(false);
      showEntry({ role: 'ai', kind: 'qa', scenes: oneScene('Nothing to quiz you on yet. Let me teach it first, then I will quiz you properly.', 'cheeky', 'shrug'), chips: [] });
      return;
    }
    startQuiz({ early: p.step < p.steps.length });
  };

  // When you step in with a question mid-class, remember where he was so the class can pick up afterwards.
  const resumeFor = (e, cu) => {
    if (!e) return null;
    if (e.kind === 'lecture') return () => (cu.done ? lectureDone(e.step) : play(cu.i, cu.s));
    if (e.kind === 'quizfb' || e.kind === 'quizin') return () => nextQuestion();
    if (e.kind === 'quizhint') return () => armQuizTimers();
    return null;
  };
  const keepPlace = () => {
    const c = cls.current;
    if (c.resumeFn) return;
    const cu = curRef.current; const e = cu ? logRef.current[cu.i] : null;
    if (e && cu && !cu.cut) c.resumeFn = resumeFor(e, cu);
    if (!c.resumeFn && c.quiz?.waiting) c.resumeFn = () => armQuizTimers();
  };

  // What happens when an answer has finished playing.
  const entryEnded = (a) => {
    const c = cls.current;
    if (!a || a.handled) return;
    a.handled = true;
    if (a.kind === 'skit') { setSkitProp(null); const f = skitNext.current; skitNext.current = null; if (f) later(f, 500); return; }
    if (!c.on || hwOpenRef.current) { setTurn('you'); return; }
    switch (a.kind) {
      case 'lecture': lectureDone(a.step); break;
      case 'qa': if (c.resumeFn) { const f = c.resumeFn; c.resumeFn = null; proceed(f); } else setTurn('you'); break;
      case 'quizin': case 'quizfb': proceed(nextQuestion); break;
      case 'quizq': case 'quizhint': gate(armQuizTimers); break;
      case 'quizdone': askRef.current('', 'wrapup', { minutesLeft: 3, quiz: lastQuiz.current }); break;
      case 'quizback': proceed(() => teachStep(planRef.current.step)); break;
      case 'resume': carryOn(); break;
      default: break;
    }
  };

  const ask = useCallback(async (question, level, opts = {}) => {
    if (thinkingRef.current) return;
    // Homework first: the first class on a course with homework due starts with the check.
    if ((level === 'start' || level === 'live_start') && hwRef.current && !hwChecked.current) {
      hwChecked.current = true; afterRef.current = null; level = 'homework_check';
      setHwOpen(true); setHwText(''); sig.current = { pasted: 0, typed: 0, first: 0 };
      nextAfterHw.current = liveRef.current ? 'live_start' : 'start';
    }
    const c = cls.current;
    // The class is run by the class itself: lecture first, quiz at the end.
    if (level === 'start' || level === 'live_start') { if (!c.on) beginClass(); return; }
    const userText = level ? QUICK.find(([k]) => k === level)?.[1].replace(/^\S+\s/, '') || '' : String(question || '').trim();
    if (!level && !userText) return;
    // An answer to the quiz question he just asked.
    if (!level && c.quiz?.waiting) { setQ(''); answerQuiz(userText); return; }
    if (level === 'wrapup') {
      c.on = false; c.quiz = null; c.pending = null; c.resumeFn = null; setClassOn(false); setQuizUi(null); setPaused(false); c.paused = false;
    } else if (c.on && level !== 'homework_check' && level !== 'homework_grade') keepPlace();
    const kind = c.on && level !== 'homework_check' && level !== 'homework_grade' ? 'qa' : 'misc';
    clearTimers(); clearWait(); hush(); setTalking(false); setIdle(null); setHeard('');
    const history = logRef.current.map((m) => ({ role: m.role, text: m.role === 'ai' ? m.scenes.map((x) => x.say).join(' ') : m.text }));
    if (!['homework_check', 'homework_grade', 'wrapup'].includes(level)) setLog((l) => { const n = [...l, { role: 'user', text: userText }]; logRef.current = n; return n; });
    setQ(''); setThinking(true); thinkingRef.current = true;
    const ck = CACHEABLE.includes(level) && !liveRef.current ? `${planKey}|${level}` : null;
    if (ck && !opts.fresh) {
      const hit = readAnswers()[ck];
      if (hit?.scenes?.length) { showEntry({ role: 'ai', kind, scenes: hit.scenes, chips: [`__fresh__:${level}`, ...(hit.chips || [])], cached: true }); setThinking(false); thinkingRef.current = false; return; }
    }
    try {
      const p = await ensurePlan();
      const hwFor = ['homework_check', 'homework_grade'].includes(level) ? hwRef.current : null;
      const j = await askStudy({ type: 'stage', level: level || undefined, homework: hwFor ? { title: hwFor.title, task: hwFor.task, deliverable: hwFor.deliverable, misses: hwFor.misses || 0 } : undefined, submission: opts.submission, images: opts.images, signals: opts.signals, skipped: opts.skipped || undefined, minutesLeft: opts.minutesLeft, quiz: level === 'wrapup' ? (opts.quiz || lastQuiz.current || undefined) : undefined, question: userText, topic: subject, context: context(), history, live: liveRef.current, interrupted: opts.interrupted || undefined, plan: p ? { steps: p.steps } : undefined, step: p ? p.step : undefined });
      if (level === 'wrapup' && j.homework) { onSetHomework?.(j.homework); setHwSet(j.homework); }
      if (level === 'homework_grade') { onGradeHomework?.(j.grade, !!opts.skipped); setHwVerdict({ ...(j.grade || {}), skipped: !!opts.skipped }); setHwOpen(false); afterRef.current = opts.then || (liveRef.current ? 'live_start' : 'start'); }
      const entry = { role: 'ai', kind, scenes: j.scenes || [], chips: j.chips || [] };
      if (ck && entry.scenes.length) saveAnswer(ck, entry);
      showEntry(entry);
    } catch (e) {
      showEntry({ role: 'ai', kind, error: true, scenes: [{ say: e.message || 'My circuits tangled. Try again?', mood: 'surprised', gesture: 'shrug', board: null }], chips: [] });
    } finally { setThinking(false); thinkingRef.current = false; }
  }, [subject, context, play]); // eslint-disable-line react-hooks/exhaustive-deps
  const askRef = useRef(ask); askRef.current = ask;
  K.current = { entryEnded, stepKey: (p, k) => `${planKeyRef.current}|${p?.sig}|${k}` };
  const nextAfterHw = useRef('start');
  const handIn = (skipped) => {
    const s0 = sig.current;
    const signals = { pasted: s0.pasted, typed: s0.typed, seconds: s0.first ? Math.round((Date.now() - s0.first) / 1000) : 0 };
    if (!skipped && hwText.trim().length < 3 && !hwImgs.length) return;
    setLog((l) => { const n = [...l, { role: 'user', text: skipped ? "I didn't do the homework." : `Homework:\n${hwText.trim()}` }]; logRef.current = n; return n; });
    // bypass the "user turn" path: grade directly
    askRef.current('', 'homework_grade', { submission: skipped ? '' : hwText.trim(), images: skipped ? undefined : hwImgs, signals, skipped, then: nextAfterHw.current }); setHwImgs([]);
  };

  // Before teaching he reads everything and plans the session. Re-planned when the material changes.
  async function ensurePlan(force = false) {
    if (!brief) return null;
    if (prepare) await prepare(() => setReading('lesson for the first time (researching it once, then it is saved)'));
    const b = brief();
    const sig = `${b.text.length}:${b.read.notes}:${b.read.cards}`;
    const have = planRef.current;
    if (!force && have && have.key === planKey && have.sig === sig && have.mode) return have; // plans without a class type are from before: re-plan
    const saved = loadPlans()[planKey];
    if (!force && saved && saved.sig === sig && saved.mode) { setPlan(saved); planRef.current = saved; return saved; }
    const r = b.read;
    setReading([r.lessons && `${r.lessons} lesson${r.lessons === 1 ? '' : 's'} of notes`, r.notes && `${r.notes} saved note${r.notes === 1 ? '' : 's'}`, r.cards && `${r.cards} flashcard${r.cards === 1 ? '' : 's'}`, r.weak && `${r.weak} weak spot${r.weak === 1 ? '' : 's'}`].filter(Boolean).join(', ') || 'the topic');
    try {
      const j = await askStudy({ type: 'plan', topic: subject, context: b.text });
      const p = { ...j.plan, step: 0, key: planKey, sig, read: r };
      setPlan(p); planRef.current = p; savePlan(planKey, p);
      return p;
    } catch { return null; } finally { setReading(null); }
  }
  const jumpTo = (k) => { const p = planRef.current; if (!p) return; const n = { ...p, step: k }; setPlan(n); planRef.current = n; savePlan(planKey, n); setShowPlan(false); cls.current.on = false; beginClass({ from: k }); };

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
    // Remember where he was, so the class carries on after he has dealt with you.
    const cu = curRef.current;
    if (cls.current.on && !cls.current.resumeFn && cu && logRef.current[cu.i]?.kind === 'lecture') cls.current.resumeFn = () => play(cu.i, cu.s);
    clearTimers(); hush(); playId.current++; setTalking(false); saying.current = '';
    setCur((c) => (c ? { ...c, done: true, cut: true } : c));
    setIdle({ mood: 'surprised', gesture: 'shrug', line: pick(L('CUTS', CUTS)) });
    said.current = because;
    setTurn('you'); micTries.current = 0;
  };
  const submitHeard = () => {
    const t = said.current.trim(); said.current = ''; setHeard('');
    if (t.length < 2) return;
    if (hwOpenRef.current) { setHwText((x) => (x ? `${x} ${t}` : t)); sig.current.typed += t.length; if (!sig.current.first) sig.current.first = Date.now(); return; } // spoken homework goes in the hand-in box
    const interrupted = cutOff.current; cutOff.current = '';
    askRef.current(t, null, { interrupted });
  };
  // ── The mic: it listens only on your turn, never while he talks. Android stops listening after a few seconds of
  // silence; instead of restarting forever (the mic flicking on and off), it tries twice more, then waits for a tap.
  function micOff() { clearTimeout(endT.current); try { rec.current?.abort(); } catch { /* none */ } rec.current = null; setMic((m) => (m === 'listening' ? 'off' : m)); }
  function listenTurn() {
    if (!liveRef.current || talkingRef.current || thinkingRef.current || rec.current) return;
    const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR) return;
    const r = new SR();
    r.lang = 'en-US'; r.continuous = false; r.interimResults = true; r.maxAlternatives = 1;
    r.onresult = (e) => {
      let fin = '', interim = '';
      for (let k = e.resultIndex; k < e.results.length; k++) { const t = e.results[k][0].transcript; if (e.results[k].isFinal) fin += t + ' '; else interim += t; }
      if (fin) said.current += fin;
      onActivity();
      setHeard((said.current + interim).trim());
    };
    r.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { setLiveErr('Microphone blocked. Allow it for Luxe, then try again.'); stopLive(); } };
    r.onend = () => {
      if (rec.current === r) rec.current = null;
      if (!liveRef.current) { setMic('off'); return; }
      if (said.current.trim()) { setMic('off'); micTries.current = 0; submitHeard(); return; }
      if (talkingRef.current || thinkingRef.current) { setMic('off'); return; }
      if (micTries.current < 2) { micTries.current += 1; setMic('off'); setTimeout(listenTurn, 900); }
      else setMic('idle'); // stop here; the "Tap to answer" button starts it again
    };
    try { r.start(); rec.current = r; setMic('listening'); } catch { setMic('idle'); }
  }
  const tapToAnswer = () => { micTries.current = 0; said.current = ''; setHeard(''); listenTurn(); };
  // When it becomes your turn in a live class, the mic opens (after a short breath).
  useEffect(() => {
    if (!live || turn !== 'you' || talking || thinking) return undefined;
    micTries.current = 0;
    const t = setTimeout(listenTurn, 500);
    return () => clearTimeout(t);
  }, [live, turn, talking, thinking]); // eslint-disable-line react-hooks/exhaustive-deps

  function stopLive() {
    liveRef.current = false; setLive(false); setHeard(''); clearWait(); micOff(); setMic('off');
  }
  const startLive = () => {
    const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR) { setLiveErr("This browser can't listen. Type your answers instead; he still talks."); return; }
    setLiveErr('');
    liveRef.current = true; setLive(true); setTurn('byte');
    ask('', 'live_start');
  };

  // He bursts in the first time you open the tutor.
  // A request from elsewhere in Study mode (e.g. "Teach me this" in Materials) goes first.
  const handled = useRef(null);
  useEffect(() => {
    if (!active) return;
    if (request && request.n !== handled.current) { handled.current = request.n; started.current = true; ask('', request.level === 'normal' ? 'start' : request.level, { minutesLeft: request.minutesLeft }); return; }
    if (!started.current) {
      started.current = true;
      // Walk in on him doing something weird, then the class starts.
      const k = nextSkit();
      setSkitProp(k.prop); skitNext.current = () => askRef.current('', 'start');
      showEntry({ role: 'ai', kind: 'skit', free: true, scenes: k.scenes.map(([say, mood, gesture]) => ({ say, mood, gesture, board: null })), chips: [] });
    }
  }, [active, request?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!active) { pauseClass(); clearTimers(); hush(); stopLive(); setTalking(false); setCur((c) => (c ? { ...c, done: true } : c)); } }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setIdle({ gesture: Math.random() < 0.5 ? 'laugh' : 'shrug', mood: 'cheeky', line: pick(L('POKES', POKES)) });
    setTimeout(() => setIdle((x) => (x ? { ...x, gesture: 'none' } : x)), 1800);
  };

  const answer = cur ? log[cur.i] : null;
  const scene = answer?.scenes?.[cur.s] || answer?.scenes?.[answer.scenes.length - 1] || null;
  // The board stays up until a later scene replaces it.
  const board = answer ? [...answer.scenes.slice(0, (cur?.s ?? 0) + 1)].reverse().find((x) => x.board)?.board || null : null;
  const boardKey = answer ? `${cur.i}-${answer.scenes.findIndex((x) => x.board === board)}` : 'none';
  const mood = idle?.mood || (heard ? 'thinking' : listening ? 'happy' : scene?.mood) || 'happy';
  const gesture = idle?.gesture || (talking ? (scene?.gesture === 'none' && board ? 'point' : scene?.gesture) : 'none') || 'none';
  const showText = captions || voice === 'off';
  const partNo = cls.current.step;
  const status = paused ? '⏸ Paused. Tap Carry on when you are ready.'
    : quizUi?.waiting ? (quizUi.check ? `✋ Check on part ${quizUi.part + 1}. Your turn: answer out loud or type it.` : `❓ Question ${quizUi.i + 1} of ${quizUi.n}. Your turn: answer out loud or type it.`)
    : talking ? (quizUi?.check ? `✋ Checking part ${quizUi.part + 1}` : quizUi ? `❓ Quiz: question ${quizUi.i + 1} of ${quizUi.n}` : plan?.steps?.[partNo] ? `🎙 Part ${partNo + 1} of ${plan.steps.length}: ${plan.steps[partNo].title}` : '🎙 Byte is talking…') : null;
  const bubble = idle?.line || (showText ? (cur && !cur.done ? typed : scene?.say) : status) || (thinking ? '' : classOn ? 'Ready when you are.' : 'Ask me anything. I bite only wrong answers.');
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
          {skitProp && (
            <div className={`bs bs-${skitProp}`} aria-hidden="true">
              {skitProp === 'notes' && ['♪', '♫', '♩', '♬', '♪'].map((n, i) => <span key={i} style={{ '--i': i }}>{n}</span>)}
              {skitProp === 'zzz' && ['z', 'z', 'Z'].map((n, i) => <span key={i} style={{ '--i': i }}>{n}</span>)}
              {skitProp === 'cloud' && <><span className="bs-cl">☁️</span>{[0, 1, 2, 3].map((i) => <i key={i} style={{ '--i': i }} />)}</>}
              {skitProp === 'sweat' && [0, 1, 2].map((i) => <i key={i} style={{ '--i': i }} />)}
              {skitProp === 'leaf' && <span className="bs-plant">🪴</span>}
              {skitProp === 'crumbs' && <><span className="bs-batt">🔋</span>{[0, 1, 2, 3, 4].map((i) => <i key={i} style={{ '--i': i }} />)}</>}
            </div>
          )}
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

      {plan && (
        <div className="card-2" style={{ marginTop: 10, padding: '9px 11px' }}>
          <button onClick={() => setShowPlan(!showPlan)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', width: '100%', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 16 }}>📋</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{plan.title || 'Today\'s lesson'}</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{plan.step >= plan.steps.length ? 'All steps done 🎉' : `Step ${plan.step + 1} of ${plan.steps.length}: ${plan.steps[plan.step].title}`}</span>
            </span>
            <span style={{ fontSize: 12 }}>{showPlan ? '⌃' : '⌄'}</span>
          </button>
          <div style={{ display: 'flex', gap: 3, marginTop: 7 }}>{plan.steps.map((_, k) => <span key={k} style={{ flex: 1, height: 4, borderRadius: 2, background: k < plan.step ? '#34D399' : k === plan.step ? '#FBBF24' : 'var(--border)' }} />)}</div>
          {showPlan && (
            <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.45 }}>
              {plan.read && <div style={{ color: 'var(--text-3)', marginBottom: 6 }}>Byte read: {[plan.read.kb && 'his saved research on this lesson', plan.read.lessons && `${plan.read.lessons} lessons of notes`, plan.read.notes && `${plan.read.notes} notes`, plan.read.cards && `${plan.read.cards} flashcards`, plan.read.weak && `${plan.read.weak} weak spots`].filter(Boolean).join(' · ') || 'the topic only (no notes yet)'}</div>}
              {plan.steps.map((st, k) => (
                <button key={k} onClick={() => jumpTo(k)} disabled={thinking} style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', display: 'flex', gap: 7, width: '100%', padding: '5px 2px', opacity: k < plan.step ? 0.6 : 1 }}>
                  <span>{k < plan.step ? '✅' : k === plan.step ? '👉' : '▫️'}</span>
                  <span style={{ flex: 1 }}><b>{st.title}</b><span style={{ color: 'var(--text-3)' }}> · {st.goal}</span></span>
                </button>
              ))}
              {plan.weak?.length > 0 && <div style={{ marginTop: 6 }}><b>Fixing:</b> {plan.weak.join(' · ')}</div>}
              {plan.known?.length > 0 && <div style={{ marginTop: 3, color: 'var(--text-3)' }}><b>You already know:</b> {plan.known.join(' · ')}</div>}
              <button className="btn-ghost" style={{ marginTop: 8 }} disabled={thinking} onClick={async () => { setShowPlan(false); hush(); setThinking(true); thinkingRef.current = true; await ensurePlan(true); setThinking(false); thinkingRef.current = false; cls.current.on = false; cls.current.quiz = null; setQuizUi(null); askRef.current('', 'start'); }}>↻ Re-read my notes and re-plan</button>
            </div>
          )}
        </div>
      )}

      {codeOpen && <CodePad lang={planRef.current?.lang || 'python'} topic={subject} goal={planRef.current?.steps?.map((x) => x.goal).join('; ')} context={context()} onSay={(t, m) => { if (!talkingRef.current) showEntry({ role: 'ai', kind: 'misc', free: true, scenes: oneScene(t, m || 'happy', 'explain'), chips: [] }); }} onClose={() => { setCodeOpen(false); if (cls.current.on && cls.current.paused) carryOn(); }} />}
      {!codeOpen && planRef.current?.mode === 'coding' && !thinking && <button className="btn-ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => setCodeOpen(true)}>💻 Code it yourself (exercise + LeetCode)</button>}
      {hwOpen && homework && (
        <div className="card" style={{ marginTop: 10, padding: 12, borderColor: 'rgba(251,146,60,.5)', background: 'linear-gradient(135deg,rgba(251,146,60,.10),transparent)' }}>
          <div style={{ fontWeight: 800, fontSize: 13.5 }}>📌 Homework check: {homework.title}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.5 }}>{homework.task}</div>
          {homework.deliverable && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>Show: {homework.deliverable}</div>}
          {homework.misses > 0 && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>Skipped {homework.misses} time{homework.misses === 1 ? '' : 's'} already.</div>}
          <textarea className="input" rows={homework.kind === 'code' ? 10 : 5} spellCheck={homework.kind !== 'code'} style={{ marginTop: 8, ...(homework.kind === 'code' ? { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5, background: '#0A0D12', color: '#D1FAE5', whiteSpace: 'pre' } : {}) }} value={hwText} placeholder={homework.kind === 'code' ? `Write your ${homework.lang || 'code'} here…` : 'Your work, in your own words (or a link to it)…'}
            onKeyDown={(e) => { if (homework.kind === 'code' && e.key === 'Tab') { e.preventDefault(); const el = e.target, a = el.selectionStart; setHwText((t) => `${t.slice(0, a)}    ${t.slice(el.selectionEnd)}`); requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = a + 4; }); } }}
            onPaste={(e) => { sig.current.pasted += (e.clipboardData?.getData('text') || '').length; if (!sig.current.first) sig.current.first = Date.now(); }}
            onInput={(e) => { const t = e.nativeEvent?.inputType || ''; if (!t.includes('Paste')) sig.current.typed += (e.nativeEvent?.data || '').length || 1; if (!sig.current.first) sig.current.first = Date.now(); }}
            onChange={(e) => setHwText(e.target.value)} />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
            {hwImgs.map((src, i) => <div key={i} style={{ position: 'relative' }}><img src={src} alt={`Homework photo ${i + 1}`} style={{ width: 48, height: 64, objectFit: 'cover', borderRadius: 6 }} /><button aria-label="Remove photo" onClick={() => setHwImgs((x) => x.filter((_, k) => k !== i))} style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, border: 0, background: '#000', color: '#fff', fontSize: 10 }}>✕</button></div>)}
            {hwImgs.length < 4 && <label className="btn-ghost" style={{ cursor: 'pointer', fontSize: 12 }}>📷 {hwImgs.length ? 'Add photo' : 'Photo of handwritten work'}<input type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }} onChange={async (e) => { const out = []; for (const f of Array.from(e.target.files || []).slice(0, 4 - hwImgs.length)) { try { out.push(await resizeImage(f, 1400, 0.8)); } catch { /* skip */ } } setHwImgs((x) => [...x, ...out].slice(0, 4)); if (!sig.current.first) sig.current.first = Date.now(); }} /></label>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>He reads photos of your handwriting too. He can tell pasted and AI-written work, so write it yourself.</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button className="btn-primary" style={{ flex: 1 }} disabled={thinking || (hwText.trim().length < 3 && !hwImgs.length)} onClick={() => handIn(false)}>✋ Hand it in</button>
            <button className="btn-ghost" disabled={thinking} onClick={() => handIn(true)}>😬 I didn't do it</button>
          </div>
        </div>
      )}
      {hwVerdict && !hwOpen && (
        <div className="card-2" style={{ marginTop: 10, padding: '9px 11px', fontSize: 12.5, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 18 }}>{hwVerdict.skipped || !hwVerdict.done ? '😤' : hwVerdict.ai_suspect ? '🤖' : hwVerdict.score >= 8 ? '🌟' : '✅'}</span>
          <span style={{ flex: 1 }}><b>Homework: {hwVerdict.skipped ? 'not done, carried over' : !hwVerdict.done ? 'not done properly, carried over' : `${hwVerdict.score}/10${hwVerdict.ai_suspect ? ' · looks AI-written' : ''}`}</b>{hwVerdict.note ? <span style={{ color: 'var(--text-3)' }}> · {hwVerdict.note}</span> : null}</span>
          <button className="btn-icon" aria-label="Dismiss" onClick={() => setHwVerdict(null)}>✕</button>
        </div>
      )}
      {hwSet && (
        <div className="card" style={{ marginTop: 10, padding: 12, borderColor: 'rgba(251,191,36,.45)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 18 }}>📌</span><b style={{ flex: 1, fontSize: 13.5 }}>Homework: {hwSet.title}</b><button className="btn-icon" aria-label="Dismiss" onClick={() => setHwSet(null)}>✕</button></div>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.5 }}>{hwSet.task}</div>
          {hwSet.deliverable && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>Bring: {hwSet.deliverable} · checked at the start of next class. By hand, no AI.</div>}
        </div>
      )}

      {/* speech bubble */}
      <div style={{ position: 'relative', marginTop: 10, padding: '10px 12px', borderRadius: 14, background: 'var(--card-2)', border: '1px solid var(--border)', minHeight: 46 }}>
        <div style={{ position: 'absolute', top: -7, left: 44, width: 12, height: 12, background: 'var(--card-2)', borderLeft: '1px solid var(--border)', borderTop: '1px solid var(--border)', transform: 'rotate(45deg)' }} />
        {thinking ? <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{reading ? `📖 Reading your ${reading} before we start…` : quizUi ? 'Marking your answer…' : classOn ? 'Getting the next part ready…' : 'Hmm… let me think about that…'}</div> : <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{bubble}</div>}
        {live && <div style={{ marginTop: 8, fontSize: 12.5, color: heard ? 'var(--green)' : 'var(--text-3)', display: 'flex', gap: 6, alignItems: 'center' }}><motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity }} style={{ width: 8, height: 8, borderRadius: 4, background: '#EF4444', display: 'inline-block' }} />{heard ? `You: ${heard}` : mic === 'listening' ? 'Listening… answer out loud.' : talking ? 'He is talking. Tap ✋ to cut in.' : mic === 'idle' ? 'Your turn.' : 'Live class on.'}{mic === 'idle' && !talking && !thinking && <button className="btn-primary" style={{ marginLeft: 'auto', padding: '4px 12px' }} onClick={tapToAnswer}>🎙 Tap to answer</button>}</div>}
        {answer && answer.scenes.length > 1 && <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>{answer.scenes.map((_, k) => <span key={k} style={{ flex: 1, height: 3, borderRadius: 2, background: k <= (cur?.s ?? 0) ? '#34D399' : 'var(--border)' }} />)}</div>}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {cur && !cur.done && <button className="btn-ghost" onClick={() => play(cur.i, cur.s + 1)}>⏭ Skip</button>}
        {answer && <button className="btn-ghost" onClick={() => play(cur.i, 0)}>↺ Replay</button>}
        {classOn && <button className="btn-ghost" onClick={paused ? carryOn : pauseClass}>{paused ? '▶ Carry on' : '⏸ Pause'}</button>}
        {!classOn && !thinking && <button className="btn-primary" onClick={() => beginClass()}>▶ Start class</button>}
        {quizUi?.waiting && !thinking && <button className="btn-ghost" onClick={reveal}>🤷 I don't know</button>}
        <button className="btn-ghost" aria-pressed={captions} onClick={() => { const v = !captions; setCaptions(v); try { localStorage.setItem('luxe_byte_cc', v ? '1' : '0'); } catch { /* private mode */ } }}>{captions ? '💬 Captions on' : '💬 Captions off'}</button>
        {live && talking && <button className="btn-primary" onClick={() => interrupt()}>✋ Interrupt</button>}
        {live && mic === 'listening' && heard && <button className="btn-ghost" onClick={() => { try { rec.current?.stop(); } catch { /* none */ } }}>➤ Done talking</button>}
        {live && heard && !talking && <button className="btn-primary" onClick={submitHeard}>➤ Send answer</button>}
        {log.length > 1 && !thinking && <button className="btn-ghost" onClick={() => ask('', 'wrapup', { minutesLeft: 3 })}>🏁 End class + homework</button>}
        {lastAi && <button className="btn-ghost" onClick={() => { const lec = log.filter((m) => m.kind === 'lecture'); onSaveNote({ title: `Byte on ${subject}`.slice(0, 80), body: (lec.length ? lec : [lastAi]).map(toMd).join('\n\n'), course_id: courseId || null }); lastAi.saved = true; setLog((l) => [...l]); }}>{lastAi.saved ? '✓ Saved' : '📝 Save lesson'}</button>}
      </div>

      <button className={live ? 'btn-ghost' : 'btn-primary'} style={{ width: '100%', marginTop: 10, padding: 12 }} onClick={() => (live ? stopLive() : startLive())}>{live ? '⏹ End live class' : '🎙 Start a live class (talk to him)'}</button>
      {liveErr && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{liveErr}</div>}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Sass:</span>
        {[['chill', '😌 Chill'], ['cheeky', '😏 Cheeky'], ['savage', '🔥 Savage']].map(([k, l]) => <button key={k} className={`chip ${sass === k ? 'active' : ''}`} style={{ fontSize: 11.5, padding: '3px 9px' }} onClick={() => { setSass(k); setSassState(k); if (!talking && !thinking) showEntry({ role: 'ai', kind: 'misc', free: true, scenes: oneScene(k === 'savage' ? 'Savage mode. I will roast your mistakes and you will learn faster out of spite. Deal?' : k === 'cheeky' ? 'Cheeky mode. A little teasing, a lot of teaching.' : 'Chill mode. Gentle and patient. I will save the roasting for later.', k === 'savage' ? 'cheeky' : 'happy', k === 'savage' ? 'lean' : 'wave'), chips: [] }); }}>{l}</button>)}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>His voice:</span>
        {BYTE_VOICES.map(([k, l]) => <button key={k} className={`chip ${voice === k ? 'active' : ''}`} style={{ fontSize: 11.5, padding: '3px 9px' }} onClick={() => { setVoice(k); voiceRef.current = k; setByteVoice(k); if (k === 'off') hush(); else if (!talking && !thinking) say(k === 'phone' ? 'This is the phone voice. Bit robotic, right?' : 'Hi. This is my voice now. Better, right?', 'cheeky'); }}>{l}</button>)}
        {voice !== 'off' && voice !== 'phone' && WHO[byteVoiceInfo()] && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>now: {WHO[byteVoiceInfo()]}{byteVoiceInfo() !== 'eleven' && byteVoiceWhy() && byteVoiceWhy() !== 'none' ? ` (ElevenLabs said: ${byteVoiceWhy()})` : ''}</span>}
      </div>
      <div className="tab-scroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '10px 0 8px' }}>
        {chips.map((c, k) => (String(c).startsWith('__fresh__:') ? <button key={'c' + k} className="chip" style={{ borderColor: 'rgba(125,249,255,.6)' }} disabled={thinking} onClick={() => ask('', c.split(':')[1], { fresh: true })}>↻ New take</button> : <button key={'c' + k} className="chip" style={{ borderColor: 'rgba(52,211,153,.5)' }} disabled={thinking} onClick={() => ask(c)}>{c}</button>))}
        {QUICK.map(([k, l]) => <button key={k} className="chip" disabled={thinking} onClick={() => (k === 'quiz' ? quizNow() : ask('', k))}>{l}</button>)}
        <button className="chip" disabled={thinking} onClick={() => setQ(`Let me explain ${subject} back to you: `)}>🗣 I'll explain it back</button>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <textarea className="input" rows={2} value={q} onFocus={() => setListening(true)} onBlur={() => setListening(false)} onChange={(e) => { setQ(e.target.value); if (cls.current.quiz?.waiting) onActivity(); }} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(q); } }} placeholder={`Ask Byte about ${subject}…`} />
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
