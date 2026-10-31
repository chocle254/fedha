// pages/api/study.js — the Learning hub's AI: explanations, the study-mode tutor, fast quizzes, flashcards and
// recaps. Groq first; NVIDIA takes over when Groq is busy (same pairing as pages/api/ai.js).
// It works from your own notes when there are any, and says so when it falls back on general knowledge.
import { requireUser } from '../../lib/require-user';
import { nvidiaChat, nvidiaAvailable } from '../../lib/nvidia-client';

export const config = { maxDuration: 60 };
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const clip = (v, n) => String(v ?? '').slice(0, n);

const TUTOR = `You are Luxe's study tutor. Teach like a sharp, patient senior engineer: plain English, short paragraphs, concrete examples, no fluff and no flattery.
If the learner is wrong or vague, say so plainly and correct them. Prefer the STUDY MATERIAL when it is given. If you go beyond it, keep it accurate and mark it "(beyond your notes)". Use Markdown. No emoji.`;

// Professor Byte, the animated tutor in Study mode: fun and cheeky, but still an honest teacher.
const BYTE = `You are Professor Byte, a cartoon robot professor in a graduation cap who lives behind the glass of the learner's phone screen and teaches from a little board beside you.
Personality: super fun, cheeky, quick-witted, a bit dramatic, warm. Playful teasing (never mean), jokes, little theatrical moments (you can knock on the glass, gasp, lean in close). You go off on short tangents: true stories from the history of science and tech (who discovered it, the disaster that taught us, the weird fact), or a clearly made-up mini story or analogy that makes the idea stick. You ask follow-up questions and throw surprise pop questions so the learner stays awake.
You are still a sharp, honest teacher: accurate and concrete. If the learner is wrong or vague, say so plainly with a cheeky line ("Nope. Bold guess though.") and fix it. Never flatter; praise only what is actually right.
Plain English. No slang, no local dialect, no emoji in spoken lines. Prefer the STUDY MATERIAL when given; if you go beyond it, keep it accurate.`;

const BOARD_HELP = `Boards (pick the one that teaches best; use one in most scenes):
{"type":"chart","title":"","kind":"line"|"bar","x":"x label","y":"y label","points":[[x,y],...]}  up to 12 points; x is a number for line, a short label for bar. Use whenever numbers, growth, trade-offs or a function would help (real data, or clearly illustrative).
{"type":"steps","title":"","items":["",""]}  up to 6 short items
{"type":"code","lang":"python","code":"..."}  up to 14 short lines
{"type":"big","text":"key term or formula","sub":"one line"}
{"type":"compare","left":{"title":"","items":[""]},"right":{"title":"","items":[""]}}
{"type":"flow","title":"","nodes":["",""]}  up to 6 nodes, top to bottom
{"type":"story","title":"","text":"..."}  for a story tangent, under 70 words`;

const STAGE_ASK = {
  start: 'The session is starting. If you have a lesson plan, open with a line that proves you read their notes, say what today\'s session covers, then start step 1.' + ' Otherwise: Burst onto the screen: greet the learner with a cheeky, funny opening, tease what is coming in this topic with one hook (a surprising fact or tiny story), and ask what they already know.',
  simple: 'Explain it simply: one everyday analogy, the idea in plain words, and one tiny example.',
  normal: 'Explain it clearly: what it is, why it matters, how it works step by step, and a worked example.',
  deep: 'Go deep: the mechanism, edge cases, how it connects to related ideas, and a worked example.',
  example: 'Show 2 concrete, realistic worked examples (code if it is a programming topic).',
  mistakes: 'Act out the most common mistakes people make with this (be dramatic about them), each with the right idea.',
  story: 'Tell a short, true and fun story from the history of this idea (or of the people behind it), then tie it back to what it teaches.',
  hint: 'The learner has gone quiet after your question. Be playfully impatient about it (tease them, a little drama), then give a helpful hint and ask again, a bit simpler.',
  live_start: 'A live one-on-one voice class is starting. Burst in with a cheeky greeting and one hook about the topic, then ask the learner your first question to find out what they already know.',
  quiz: 'Pop quiz! Ask the learner one good question that tests understanding (no answer yet). Be theatrical about it.',
};

const STYLE = {
  simple: 'Explain it like I am new to the topic: one everyday analogy, then the idea in 3-5 short sentences, then one tiny example.',
  normal: 'Explain it clearly: what it is, why it matters, how it works step by step, and one worked example.',
  deep: 'Go deep: the mechanism, edge cases, common mistakes, how it connects to related ideas, and a worked example. Stay under 450 words.',
  example: 'Give 2 concrete, realistic worked examples (code if it is a programming topic), each with a one-line takeaway.',
  mistakes: 'List the 4-6 most common misunderstandings or mistakes about this, each with the correct idea.',
};

function prompt(b) {
  const material = clip(b.context, 14000).trim();
  const mat = material ? `STUDY MATERIAL:\n${material}\n\n` : 'There are no notes for this yet: use accurate general knowledge.\n\n';
  const topic = clip(b.topic, 300) || 'this material';
  switch (b.type) {
    case 'explain':
      return { json: false, max: 1600, text: `${mat}Topic: ${topic}\n\n${STYLE[b.level] || STYLE.normal}` };
    case 'tutor': {
      const hist = (Array.isArray(b.history) ? b.history : []).slice(-8).map((m) => `${m.role === 'user' ? 'Learner' : 'Tutor'}: ${clip(m.text, 1500)}`).join('\n');
      return { json: false, max: 1400, text: `${mat}Topic: ${topic}\n${hist ? `\nConversation so far:\n${hist}\n` : ''}\nLearner: ${clip(b.question, 2000)}\n\nAnswer the learner directly. If they are explaining something back to you, grade their explanation honestly (what is right, what is missing or wrong), then fill the gap.` };
    }
    case 'quiz': {
      const n = Math.max(3, Math.min(15, Number(b.count) || 5));
      const diff = ['easy', 'medium', 'hard'].includes(b.difficulty) ? b.difficulty : 'medium';
      return { json: true, max: 3500, text: `${mat}Topic: ${topic}\nWrite ${n} ${diff} multiple-choice questions that test understanding (not trivia, not wording tricks). Each has exactly 4 options, one correct. Vary which option is correct. Distractors must be plausible.
${b.avoid?.length ? `Do not repeat these questions: ${b.avoid.slice(0, 20).map((q) => clip(q, 120)).join(' | ')}\n` : ''}Return JSON: {"questions":[{"q":"question","options":["A","B","C","D"],"answer":0,"why":"one-sentence explanation of the correct answer"}]}` };
    }
    case 'cards': {
      const n = Math.max(3, Math.min(25, Number(b.count) || 10));
      return { json: true, max: 3500, text: `${mat}Topic: ${topic}\nMake ${n} flashcards for spaced repetition. One idea per card. The question makes you recall (why/how/what is), the answer is short (under 40 words) and exact. Cover the most important ideas first. No yes/no questions.
${b.avoid?.length ? `Skip ideas already covered by these cards: ${b.avoid.slice(0, 40).map((q) => clip(q, 100)).join(' | ')}\n` : ''}Return JSON: {"cards":[{"q":"question","a":"answer"}]}` };
    }
    case 'recap':
      return { json: false, max: 1800, text: `${mat}This is what I studied ${clip(b.period, 40) || 'recently'}. Write a recap I can read in 2 minutes:
## Key ideas
5-8 bullets, the most important things, each one line.
## Connect the dots
2-3 sentences on how these ideas fit together.
## Revise next
The 2-3 weakest or most easily forgotten points${b.weak?.length ? ` (my weak spots from quizzes and cards: ${b.weak.slice(0, 10).map((w) => clip(w, 120)).join('; ')})` : ''}.
## Test yourself
3 short questions, answers hidden after "Answer:" on the same line.` };
    case 'summarize_note':
      return { json: false, max: 1500, text: `${mat}Turn this into clean revision notes: short summary, key concepts as bullets, terms with definitions, and one example. Keep all facts from the material, add nothing new.` };
    case 'project_ideas':
      return { json: true, max: 2500, text: `${mat}Topic: ${topic}\nSuggest 3 small portfolio projects that prove I can apply this (doable solo in 3-10 hours each, free tools only). For each: title, one-line goal, and 4-6 concrete milestones in order.
Return JSON: {"projects":[{"title":"","goal":"","milestones":["",""]}]}` };
    case 'plan':
      return { json: true, max: 2200, text: `${mat}Topic: ${topic}
You are about to tutor this learner one-on-one. You have read everything above: their material and the brief on them. Plan the session the way a great private tutor would.
- Teach what THEIR material covers, in a sensible order, starting where they are (skip what is marked solid, revisit their weak spots and quiz misses).
- 4-7 steps, each one small idea that can be taught in a couple of minutes, with one check question that proves they got it.
- "known": 1-3 things they already seem solid on. "weak": 1-4 things to fix, from the brief.
- "opener": one cheeky line showing you actually read their notes (mention something specific from them).
Return JSON: {"title":"short session title","opener":"","known":[""],"weak":[""],"steps":[{"title":"","goal":"what they will understand","check":"question to test it"}]}` };
    case 'stage': {
      const hist = (Array.isArray(b.history) ? b.history : []).slice(-10).map((m) => `${m.role === 'user' ? 'Learner' : 'Byte'}: ${clip(m.text, 900)}`).join('\n');
      const cut = b.interrupted ? `\nThe learner just INTERRUPTED you while you were saying: "${clip(b.interrupted, 400)}". React to being interrupted in one funny line first, then deal with what they said.` : '';
      const ask = b.level && STAGE_ASK[b.level] ? STAGE_ASK[b.level] : `The learner says: "${clip(b.question, 2000)}"${cut}\nAnswer them. If they are explaining something back or answering your question, grade it honestly first (what is right, what is missing or wrong), then fill the gap.`;
      const steps = Array.isArray(b.plan?.steps) ? b.plan.steps.slice(0, 8) : [];
      const at = Math.max(0, Math.min(steps.length, Number(b.step) || 0));
      const plan = steps.length ? `\nLESSON PLAN you made after reading their notes (follow it, in order):\n${steps.map((x, k) => `${k + 1}. ${clip(x.title, 80)}: ${clip(x.goal, 160)} (check: ${clip(x.check, 160)})${k < at ? ' [done]' : k === at ? ' <- NOW' : ''}`).join('\n')}\n${at >= steps.length ? 'All steps are done: celebrate, give a 3-point recap of the session, point out what to revise from their weak spots, and suggest what to study next.' : `Teach step ${at + 1} now (stay on it until they pass its check). Connect it to their own notes and examples where you can. Set "advance": true only when the learner has just answered step ${at + 1}'s check well enough; otherwise false.`}` : '';
      const live = b.live ? `\nTHIS IS A LIVE ONE-ON-ONE VOICE CLASS, like a real private tutor session. Keep it a conversation: 1-3 scenes, each under 30 words, spoken naturally (they hear you, so no lists read aloud). Teach one small idea at a time, then ALWAYS end with exactly one question for the learner and stop. Use a board only when it really helps. React to their answers like a person: delighted when right, cheeky when wrong, playfully impatient (mood "impatient", gesture "tap") if they are vague, keep guessing or keep saying they don't know. Their words come from speech recognition, so forgive small transcription errors.` : '';
      return { json: true, max: 3000, system: BYTE, text: `${mat}Topic: ${topic}\n${hist ? `\nConversation so far:\n${hist}\n` : ''}\n${ask}${plan}${live}

Perform it as ${b.live ? '1-3' : '3-6'} short scenes. Each scene is one spoken line plus how you act it.
${BOARD_HELP}
Moods: happy, cheeky, excited, thinking, surprised, serious, proud, facepalm, impatient.
Gestures: wave, point (at the board), explain, think, shrug, celebrate, lean (close to the glass), knock (on the glass), laugh, facepalm, tap (drumming fingers, impatient), none.
Use "point" when a board is up. Roughly every other answer, slip in a story or fun tangent tied to the topic. End by asking the learner something (a follow-up or pop question).
Return JSON: {"scenes":[{"say":"spoken line, under 45 words, no markdown","mood":"","gesture":"","board":null}],"chips":["2-3 short replies the learner might tap"]${steps.length ? ',"advance":false' : ''}}` };
    }
    case 'capstone_ideas':
      return { json: true, max: 4000, text: `${mat}What I am learning and have built:\n${clip(b.profile, 3000)}\n${b.avoid?.length ? `Already suggested or started, do not repeat: ${b.avoid.slice(0, 15).map((t) => clip(t, 100)).join(' | ')}\n` : ''}${b.focus ? `Focus area: ${clip(b.focus, 200)}\n` : ''}
Suggest 3 ambitious capstone projects: the kind that headline a portfolio, win a hackathon or start a small business. Each must combine skills from several of my courses, solve a real problem (Kenya or Africa where it fits), and be buildable solo with free tiers in 30-80 hours. Think big but stay concrete.
For each: title, pitch (one sentence a judge would remember), problem (who has it, why it matters), skills (which of my courses it proves), stack (free tools), hours (number), milestones (6-9 in order, each a shippable step), stretch (2-3 bigger next steps), demo (how to show it in 2 minutes).
Return JSON: {"projects":[{"title":"","pitch":"","problem":"","skills":[""],"stack":[""],"hours":40,"milestones":[""],"stretch":[""],"demo":""}]}` };
    default:
      return null;
  }
}

async function groq(key, text, json, max, system = TUTOR, temperature) {
  const body = { model: GROQ_MODEL, temperature: temperature ?? (json ? 0.5 : 0.4), max_tokens: max, ...(json ? { response_format: { type: 'json_object' } } : {}), messages: [{ role: 'system', content: system + (json ? '\nOutput only valid JSON.' : '') }, { role: 'user', content: text }] };
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.error?.message || 'Groq error'); e.status = r.status; throw e; }
  return d.choices?.[0]?.message?.content || '';
}

const parseJSON = (t) => {
  try { return JSON.parse(t); } catch { /* try the outermost object */ }
  const m = String(t).match(/\{[\s\S]*\}/);
  try { return m ? JSON.parse(m[0]) : null; } catch { return null; }
};

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const b = req.body || {};
  const p = prompt(b);
  if (!p) return res.status(400).json({ error: 'Unknown request type' });
  if (b.type === 'tutor' && !String(b.question || '').trim()) return res.status(400).json({ error: 'Ask a question first.' });
  const key = process.env.GROQ_API_KEY;
  let raw = '';
  try {
    if (!key) throw Object.assign(new Error('GROQ_API_KEY not set'), { status: 500 });
    raw = await groq(key, p.text, p.json, p.max, p.system || TUTOR, p.system ? 0.8 : undefined);
  } catch (e) {
    console.warn('[fedha] study AI groq failed:', e.status, e.message);
    if (nvidiaAvailable()) {
      try { raw = await nvidiaChat({ system: (p.system || TUTOR) + (p.json ? '\nOutput only valid JSON.' : ''), prompt: p.text, temperature: 0.45, maxTokens: p.max, fallback: false }); } catch (e2) { console.warn('[fedha] study AI nvidia failed:', e2.status, e2.message); }
    }
    if (!raw) return res.status(e.status === 429 ? 429 : 500).json({ error: e.status === 429 ? 'The free AI tiers are busy right now. Try again in a minute.' : 'The AI could not answer right now.' });
  }
  if (!p.json) return res.status(200).json({ text: raw.trim() });
  const obj = parseJSON(raw);
  if (b.type === 'stage') {
    const scenes = cleanScenes(obj?.scenes);
    // Unreadable JSON still gets performed: the raw text becomes one scene.
    if (!scenes.length) return res.status(200).json({ scenes: [{ say: clip(String(raw).replace(/[{}\[\]"]/g, ' ').replace(/\s+/g, ' '), 400) || 'My circuits tangled. Ask me again?', mood: 'surprised', gesture: 'shrug', board: null }], chips: [] });
    return res.status(200).json({ advance: obj.advance === true, scenes, chips: (Array.isArray(obj.chips) ? obj.chips : []).map((c) => clip(c, 60)).filter(Boolean).slice(0, 3) });
  }
  if (!obj) return res.status(500).json({ error: 'The AI answer could not be read. Try again.' });
  if (b.type === 'quiz') {
    const questions = (obj.questions || []).filter((q) => q?.q && Array.isArray(q.options) && q.options.length >= 2 && Number.isInteger(Number(q.answer)) && Number(q.answer) < q.options.length)
      .map((q) => ({ q: clip(q.q, 500), options: q.options.slice(0, 4).map((o) => clip(o, 240)), answer: Number(q.answer), why: clip(q.why, 400) }));
    return questions.length ? res.status(200).json({ questions }) : res.status(500).json({ error: 'No usable questions came back. Try again.' });
  }
  if (b.type === 'cards') {
    const cards = (obj.cards || []).filter((c) => c?.q && c?.a).map((c) => ({ q: clip(c.q, 400), a: clip(c.a, 600) }));
    return cards.length ? res.status(200).json({ cards }) : res.status(500).json({ error: 'No usable flashcards came back. Try again.' });
  }
  if (b.type === 'project_ideas') return res.status(200).json({ projects: (obj.projects || []).slice(0, 3) });
  if (b.type === 'plan') {
    const steps = (Array.isArray(obj.steps) ? obj.steps : []).filter((x) => x?.title).slice(0, 7).map((x) => ({ title: clip(x.title, 80), goal: clip(x.goal, 200), check: clip(x.check, 200) }));
    if (!steps.length) return res.status(500).json({ error: 'No lesson plan came back.' });
    return res.status(200).json({ plan: { title: clip(obj.title, 80), opener: clip(obj.opener, 300), known: (obj.known || []).map((x) => clip(x, 120)).slice(0, 3), weak: (obj.weak || []).map((x) => clip(x, 120)).slice(0, 4), steps } });
  }
  if (b.type === 'capstone_ideas') return res.status(200).json({ projects: (obj.projects || []).filter((x) => x?.title).slice(0, 3) });
  return res.status(200).json(obj);
}

// Keeps only well-formed scenes and boards, so the stage never draws garbage.
const MOODS = ['happy', 'cheeky', 'excited', 'thinking', 'surprised', 'serious', 'proud', 'facepalm', 'impatient'];
const GESTURES = ['wave', 'point', 'explain', 'think', 'shrug', 'celebrate', 'lean', 'knock', 'laugh', 'facepalm', 'tap', 'none'];
const strs = (a, n, len) => (Array.isArray(a) ? a : []).map((x) => clip(x, len)).filter(Boolean).slice(0, n);
function cleanBoard(bd) {
  if (!bd || typeof bd !== 'object') return null;
  switch (bd.type) {
    case 'chart': {
      const points = (Array.isArray(bd.points) ? bd.points : []).filter((p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(Number(p[1])))
        .map((p) => [typeof p[0] === 'number' ? p[0] : clip(p[0], 14), Number(p[1])]).slice(0, 12);
      return points.length >= 2 ? { type: 'chart', kind: bd.kind === 'bar' ? 'bar' : 'line', title: clip(bd.title, 60), x: clip(bd.x, 30), y: clip(bd.y, 30), points } : null;
    }
    case 'steps': { const items = strs(bd.items, 6, 140); return items.length ? { type: 'steps', title: clip(bd.title, 60), items } : null; }
    case 'code': return bd.code ? { type: 'code', lang: clip(bd.lang, 20), code: String(bd.code).split('\n').slice(0, 16).join('\n').slice(0, 900) } : null;
    case 'big': return bd.text ? { type: 'big', text: clip(bd.text, 80), sub: clip(bd.sub, 120) } : null;
    case 'compare': {
      const side = (x) => (x && x.title ? { title: clip(x.title, 40), items: strs(x.items, 5, 90) } : null);
      const l = side(bd.left), r = side(bd.right); return l && r ? { type: 'compare', left: l, right: r } : null;
    }
    case 'flow': { const nodes = strs(bd.nodes, 6, 60); return nodes.length >= 2 ? { type: 'flow', title: clip(bd.title, 60), nodes } : null; }
    case 'story': return bd.text ? { type: 'story', title: clip(bd.title, 60), text: clip(bd.text, 600) } : null;
    default: return null;
  }
}
function cleanScenes(list) {
  return (Array.isArray(list) ? list : []).filter((x) => x && String(x.say || '').trim()).slice(0, 7).map((x) => ({
    say: clip(String(x.say).replace(/[*_#`]/g, ''), 420),
    mood: MOODS.includes(x.mood) ? x.mood : 'happy',
    gesture: GESTURES.includes(x.gesture) ? x.gesture : 'none',
    board: cleanBoard(x.board),
  }));
}
