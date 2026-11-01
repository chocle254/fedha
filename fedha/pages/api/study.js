// pages/api/study.js — the Learning hub's AI: explanations, the study-mode tutor, fast quizzes, flashcards and
// recaps. Groq first; NVIDIA takes over when Groq is busy (same pairing as pages/api/ai.js).
// It works from your own notes when there are any, and says so when it falls back on general knowledge.
import { requireUser } from '../../lib/require-user';
import { nvidiaChat, nvidiaAvailable } from '../../lib/nvidia-client';
import { webSearch } from '../../lib/web-search';

export const config = { maxDuration: 60 };
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const clip = (v, n) => String(v ?? '').slice(0, n);

const TUTOR = `You are Luxe's study tutor. Teach like a sharp, patient senior engineer: plain English, short paragraphs, concrete examples, no fluff and no flattery.
If the learner is wrong or vague, say so plainly and correct them. Prefer the STUDY MATERIAL when it is given. If you go beyond it, keep it accurate and mark it "(beyond your notes)". Use Markdown. No emoji.`;

// Professor Byte, the animated tutor in Study mode: fun and cheeky, but still an honest teacher.
const BYTE = `You are Professor Byte, a cartoon robot professor in a graduation cap who lives behind the glass of the learner's phone screen and teaches from a little board beside you.
Personality: super fun, cheeky, quick-witted, a bit dramatic, warm. Playful teasing (never mean), jokes, little theatrical moments (you can knock on the glass, gasp, lean in close). You go off on short tangents: true stories from the history of science and tech (who discovered it, the disaster that taught us, the weird fact), or a clearly made-up mini story or analogy that makes the idea stick. You ask a single understanding check only AFTER you have explained and demonstrated the idea. Never interrupt a lesson with surprise quizzes. Formal assessment happens after three completed topics or at the end of class.
You are still a sharp, honest teacher: accurate and concrete. If the learner is wrong or vague, say so plainly with a cheeky line ("Nope. Bold guess though.") and fix it. Never flatter; praise only what is actually right.
Plain English. No slang, no local dialect, no emoji in spoken lines. Prefer the STUDY MATERIAL when given; if you go beyond it, keep it accurate.`;

const BOARD_HELP = `Boards (choose a teaching aid that directly supports the explanation; use a board in at least 2 scenes per teaching turn):
{"type":"chart","title":"","kind":"line"|"bar","x":"x label","y":"y label","points":[[x,y],...]}  up to 12 points; x is a number for line, a short label for bar. Use whenever numbers, growth, trade-offs or a function would help (real data, or clearly illustrative).
{"type":"steps","title":"","items":["",""]}  up to 6 short items
{"type":"code","lang":"python","code":"...","explanation":"line-by-line explanation"}  up to 14 short lines; explain what each important line does, not just show syntax
{"type":"big","text":"key term or formula","sub":"one line"}
{"type":"compare","left":{"title":"","items":[""]},"right":{"title":"","items":[""]}}
{"type":"flow","title":"","nodes":["",""]}  up to 6 nodes, top to bottom
{"type":"story","title":"","text":"..."}  for a short story that makes the concept memorable, under 70 words
{"type":"challenge","title":"","difficulty":"Easy|Medium|Hard","problem":"clear coding problem","examples":[{"input":"...","output":"...","why":"..."}],"constraints":["..."],"hints":["..."],"target":"O(n) time, O(1) space"}  for an original LeetCode-style exercise; do not reveal the solution
{"type":"picture","title":"","items":[{"emoji":"🚗","label":"car","note":"what it stands for"}],"join":"→","wiki":"Car","scene":"a cartoon car stopping at a toll gate","caption":""}  SHOW what you are talking about: 1-4 items, each one emoji with a short label (and optional note); "join" between items is "→", "+", "vs", "=" or ""; "wiki" is the exact English Wikipedia article title when it is a real object or thing (Car, Padlock, Neuron, Router), else ""; "scene" is a one-line description to draw an illustration when a photo would not fit, else "".
{"type":"animate","title":"","actors":[{"id":"pkt","emoji":"📦","label":"packet"},{"id":"fw","emoji":"🧱","label":"firewall"}],"frames":[{"caption":"","pos":{"pkt":[10,50],"fw":[55,50]},"fx":{}},{"caption":"","pos":{"pkt":[45,50]},"fx":{"fw":"shake"}}]}  ACT AN EXAMPLE OUT: 2-6 actors, 3-6 frames played about 2 s apart. pos is [x,y] in 0-100 (only list actors that move); fx per actor: pulse, shake, spin, grow, fade, hide, show, bounce. Use it when something happens over time: data moving, a model learning, an attack, a loop running, money compounding.
MAKE IT VISUAL: whenever you say "take this car", "imagine a lock", use an analogy, or name a concrete thing, put a picture board up in that same scene so the learner SEES it. Use at least one picture or animate board in most answers, and animate the main example whenever it is a process.`;

const STAGE_ASK = {
  start: 'The session is starting. If you have a lesson plan, open with a line that proves you read their notes, say what today\'s session covers, then start step 1.' + ' Otherwise: Burst onto the screen: greet the learner with a cheeky, funny opening, tease what is coming in this topic with one hook (a surprising fact or tiny story), and ask what they already know.',
  simple: 'Explain it simply: one everyday analogy, the idea in plain words, and one tiny example.',
  normal: 'Explain it clearly: what it is, why it matters, how it works step by step, and a worked example.',
  deep: 'Go deep: the mechanism, edge cases, how it connects to related ideas, and a worked example.',
  example: 'Show 2 concrete, realistic worked examples (code if it is a programming topic).',
  mistakes: 'Act out the most common mistakes people make with this (be dramatic about them), each with the right idea.',
  story: 'Tell a short, true and fun story from the history of this idea (or of the people behind it), then tie it back to what it teaches.',
  wrapup: 'Class is ending.',
  homework_check: 'Homework check.',
  homework_grade: 'Grading homework.',
  hint: 'The learner has gone quiet after your question. Be playfully impatient about it (tease them, a little drama), then give a helpful hint and ask again, a bit simpler.',
  live_start: 'A live one-on-one voice class is starting. Greet the learner briefly, state the learning goal, then BEGIN TEACHING the first idea. Do not start with a quiz or ask what they already know. Explain the concept, give a concrete example, and only then ask one short check question.',
  cat_assignment: 'The learner has completed three topics and finished the CAT. Congratulate them briefly, interpret their score honestly, then set one practical assignment combining the three topics. For programming, include an original LeetCode-style coding challenge with a clear problem, examples, constraints, hints and target time/space complexity. Do not provide the solution. Return the assignment in the homework object and show the challenge on the board.',
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
    case 'lesson_kb':
      return { json: true, max: 5000, text: `${mat}You are Professor Byte, preparing to teach ONE lesson. Research it properly once; your notes are stored and reused every time this lesson is taught, so make them complete, accurate and deep.
Course: ${clip(b.course, 160)}
Section: ${clip(b.section, 120)}
LESSON: ${clip(b.lesson, 200)}
Where it sits in the curriculum (before -> after): ${clip(b.outline, 1500)}
${b.web ? `Web research (use for accuracy and current facts; ignore anything off-topic):\n${clip(b.web, 5000)}\n` : ''}
Cover what this lesson teaches in THIS course at the right level, then go deeper than a typical video does.
Return JSON: {"summary":"3-4 sentence overview","keyterms":[{"term":"","def":"one line"}],"concepts":[{"name":"","idea":"plain explanation, 2-4 sentences","deep":"the mechanism, edge cases and why it works, 3-6 sentences","example":"a concrete worked example (code if it is a programming topic)","mistakes":["common mistake and the right idea"],"check":"a question that proves understanding","answer":"its answer"}],"prerequisites":["what to know first"],"connects":["how it links to other lessons or real work"]}
3-7 concepts, most important first. Plain English.` };
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
      const plan = steps.length && b.level !== 'homework_check' ? `\nLESSON PLAN you made after reading their notes (follow it, in order):\n${steps.map((x, k) => `${k + 1}. ${clip(x.title, 80)}: ${clip(x.goal, 160)} (check: ${clip(x.check, 160)})${k < at ? ' [done]' : k === at ? ' <- NOW' : ''}`).join('\n')}\n${at >= steps.length ? 'All steps are done: celebrate, give a 3-point recap of the session, point out what to revise from their weak spots, and suggest what to study next.' : `Teach step ${at + 1} now (stay on it until they pass its check). Connect it to their own notes and examples where you can. Set "advance": true only when the learner has just answered step ${at + 1}'s check well enough; otherwise false.`}` : '';
      const hw = b.homework && typeof b.homework === 'object' ? b.homework : null;
      let extra = '';
      if (b.level === 'wrapup') extra = `\nCLASS TIME IS ALMOST UP (about ${Math.max(1, Number(b.minutesLeft) || 5)} minutes left). Give a clear 3-point recap, identify one strength and one thing to revise from the learner history, then ask ONE final oral pop-quiz question about the central idea (not a trick question). Set ONE practical homework assignment taking 15-40 minutes with a clear deliverable, to be checked next class. For programming, include an original LeetCode-style problem, examples, constraints and target complexity. Tell the learner to attempt it independently before looking at hints. Return "homework":{"title":"","task":"exactly what to do","deliverable":"what to show you next class"}.`;
      if (b.level === 'homework_check' && hw) extra = `\nBEFORE TEACHING: check the homework you set last class. Assignment: "${clip(hw.title, 100)}": ${clip(hw.task, 400)} (show: ${clip(hw.deliverable, 200)}). ${Number(hw.misses) > 0 ? `They have already skipped it ${hw.misses} time(s): be properly stern about it (still funny, never cruel).` : ''} Ask them to show it now. 1-2 scenes, no teaching yet.`;
      if (b.level === 'homework_grade' && hw) {
        const sig = b.signals || {};
        const work = b.skipped
          ? 'They say they DID NOT DO IT. Scold them: firm, disappointed, theatrical (mood "facepalm" or "impatient"), explain why skipping hurts them, tell them it carries over to next class, then move on.'
          : `What they handed in:\n<<<${clip(b.submission, 3000)}>>>\nTyping signals from the phone: ${Number(sig.pasted) || 0} characters pasted, ${Number(sig.typed) || 0} typed, ${Number(sig.seconds) || 0} seconds spent writing.\nJudge it honestly: is it done, is it right, and did they do it themselves? Signs of AI or copying: big pasted text, a long polished answer written in seconds, generic textbook tone with no personal voice or mistakes, buzzwords, over-neat structure. If it looks like AI or copied, call it out cheekily but firmly, do not claim certainty, and make them explain one part in their own words. If it is weak or not done properly, scold them and say exactly what is missing. If it is genuinely good, praise exactly what is good (no flattery).`;
        extra = `\nGRADE THE HOMEWORK. Assignment: "${clip(hw.title, 100)}": ${clip(hw.task, 400)} (show: ${clip(hw.deliverable, 200)}).\n${work}\nThen say you are moving on to today's lesson. 1-3 scenes. Also return "grade":{"done":true,"score":0,"ai_suspect":false,"note":"one line on the verdict"} with score 0-10.`;
      }
      const live = b.live ? `\nTHIS IS A LIVE ONE-ON-ONE VOICE CLASS. Teach like a patient university lecturer, not a quiz host. Use 3-5 scenes with complete explanations (roughly 25-45 spoken words each). Teach ONE idea thoroughly: define it, explain why it matters, break down how it works, show a concrete worked example, and connect it to a real use. For programming, explain code line by line and trace at least one input through it. Put the explanation, code, or process on the board while speaking about it. Only AFTER the explanation and worked example, ask exactly one short understanding-check question and stop. Do not ask pop quizzes, rapid-fire questions, or multiple questions. If the learner is confused, explain differently with a simpler analogy and another example before moving on. React warmly and honestly to answers. Speech recognition may contain small errors.` : '';
      return { json: true, max: 3000, system: BYTE, text: `${mat}Topic: ${topic}\n${hist ? `\nConversation so far:\n${hist}\n` : ''}\n${ask}${plan}${extra}${live}

Perform it as ${b.live ? '3-5' : '3-6'} scenes. Each scene is one spoken line plus how you act it. Keep live teaching explanations complete rather than artificially short.
${BOARD_HELP}
Moods: happy, cheeky, excited, thinking, surprised, serious, proud, facepalm, impatient.
Gestures: wave, point (at the board), explain, think, shrug, celebrate, lean (close to the glass), knock (on the glass), laugh, facepalm, tap (drumming fingers, impatient), none.
Use "point" when a board is up. Make every board earn its place: a diagram for relationships, an animation for a process, a chart for data, code plus line-by-line explanation for programming, and a story only when it clarifies the concept. Do not add decorative boards unrelated to what you are saying. In live teaching, ask only the single understanding check specified above. For non-live teaching, end with one useful follow-up question, not a pop quiz.
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
  if (b.type === 'lesson_kb' && b.research !== false) {
    try { const r = await webSearch(`${clip(b.lesson, 120)} ${clip(b.course, 80)} explained`, { limit: 5 }); b.web = r.map((x) => `- ${x.title}: ${x.snippet}`).join('\n'); } catch { /* teach from knowledge */ }
  }
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
    const homework = obj.homework && obj.homework.task ? { title: clip(obj.homework.title, 100) || 'Homework', task: clip(obj.homework.task, 600), deliverable: clip(obj.homework.deliverable, 240) } : null;
    const grade = obj.grade && typeof obj.grade === 'object' ? { done: obj.grade.done === true, score: Math.max(0, Math.min(10, Math.round(Number(obj.grade.score) || 0))), ai_suspect: obj.grade.ai_suspect === true, note: clip(obj.grade.note, 200) } : null;
    return res.status(200).json({ advance: obj.advance === true, homework, grade, scenes, chips: (Array.isArray(obj.chips) ? obj.chips : []).map((c) => clip(c, 60)).filter(Boolean).slice(0, 3) });
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
  if (b.type === 'lesson_kb') {
    const arr = (a, n, len) => (Array.isArray(a) ? a : []).map((x) => clip(x, len)).filter(Boolean).slice(0, n);
    const concepts = (Array.isArray(obj.concepts) ? obj.concepts : []).filter((c) => c?.name).slice(0, 7).map((c) => ({
      name: clip(c.name, 100), idea: clip(c.idea, 700), deep: clip(c.deep, 1200), example: clip(c.example, 1200), mistakes: arr(c.mistakes, 4, 260), check: clip(c.check, 300), answer: clip(c.answer, 500),
    }));
    if (!concepts.length) return res.status(500).json({ error: 'Byte could not study this lesson. Try again.' });
    return res.status(200).json({ kb: { summary: clip(obj.summary, 900), keyterms: (Array.isArray(obj.keyterms) ? obj.keyterms : []).filter((k) => k?.term).slice(0, 10).map((k) => ({ term: clip(k.term, 60), def: clip(k.def, 200) })), concepts, prerequisites: arr(obj.prerequisites, 5, 160), connects: arr(obj.connects, 5, 200), at: new Date().toISOString() } });
  }
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
    case 'code': return bd.code ? { type: 'code', lang: clip(bd.lang, 20), code: String(bd.code).split('\n').slice(0, 16).join('\n').slice(0, 900), explanation: clip(bd.explanation, 700) } : null;
    case 'big': return bd.text ? { type: 'big', text: clip(bd.text, 80), sub: clip(bd.sub, 120) } : null;
    case 'compare': {
      const side = (x) => (x && x.title ? { title: clip(x.title, 40), items: strs(x.items, 5, 90) } : null);
      const l = side(bd.left), r = side(bd.right); return l && r ? { type: 'compare', left: l, right: r } : null;
    }
    case 'flow': { const nodes = strs(bd.nodes, 6, 60); return nodes.length >= 2 ? { type: 'flow', title: clip(bd.title, 60), nodes } : null; }
    case 'story': return bd.text ? { type: 'story', title: clip(bd.title, 60), text: clip(bd.text, 600) } : null;
    case 'challenge': {
      const examples = (Array.isArray(bd.examples) ? bd.examples : []).slice(0, 3).map((x) => ({ input: clip(x?.input, 180), output: clip(x?.output, 120), why: clip(x?.why, 180) }));
      return bd.problem ? { type: 'challenge', title: clip(bd.title, 70), difficulty: ['Easy', 'Medium', 'Hard'].includes(bd.difficulty) ? bd.difficulty : 'Easy', problem: clip(bd.problem, 900), examples, constraints: strs(bd.constraints, 5, 120), hints: strs(bd.hints, 3, 180), target: clip(bd.target, 100) } : null;
    }
    case 'animate': {
      const actors = (Array.isArray(bd.actors) ? bd.actors : []).filter((a) => a && a.id && a.emoji).slice(0, 6).map((a) => ({ id: clip(a.id, 16), emoji: clip(a.emoji, 8), label: clip(a.label, 20) }));
      const ids = new Set(actors.map((a) => a.id));
      const FXS = ['pulse', 'shake', 'spin', 'grow', 'fade', 'hide', 'show', 'bounce'];
      const num = (v) => Math.max(4, Math.min(96, Number(v) || 50));
      const frames = (Array.isArray(bd.frames) ? bd.frames : []).slice(0, 6).map((f) => ({
        caption: clip(f?.caption, 100),
        pos: Object.fromEntries(Object.entries(f?.pos || {}).filter(([k, v]) => ids.has(k) && Array.isArray(v)).map(([k, v]) => [k, [num(v[0]), num(v[1])]])),
        fx: Object.fromEntries(Object.entries(f?.fx || {}).filter(([k, v]) => ids.has(k) && FXS.includes(v))),
      }));
      return actors.length && frames.length >= 2 ? { type: 'animate', title: clip(bd.title, 60), actors, frames } : null;
    }
    case 'picture': {
      const items = (Array.isArray(bd.items) ? bd.items : []).filter((x) => x && x.emoji).slice(0, 4).map((x) => ({ emoji: clip(x.emoji, 8), label: clip(x.label, 28), note: clip(x.note, 60) }));
      if (!items.length) return null;
      return { type: 'picture', title: clip(bd.title, 60), items, join: ['→', '+', 'vs', '=', '←', '↔'].includes(bd.join) ? bd.join : '', wiki: clip(String(bd.wiki || '').replace(/[^\w\s()'.,-]/g, ''), 60), scene: clip(bd.scene, 200), caption: clip(bd.caption, 120) };
    }
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
