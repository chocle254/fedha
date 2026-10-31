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
    default:
      return null;
  }
}

async function groq(key, text, json, max) {
  const body = { model: GROQ_MODEL, temperature: json ? 0.5 : 0.4, max_tokens: max, ...(json ? { response_format: { type: 'json_object' } } : {}), messages: [{ role: 'system', content: TUTOR + (json ? '\nOutput only valid JSON.' : '') }, { role: 'user', content: text }] };
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
    raw = await groq(key, p.text, p.json, p.max);
  } catch (e) {
    console.warn('[fedha] study AI groq failed:', e.status, e.message);
    if (nvidiaAvailable()) {
      try { raw = await nvidiaChat({ system: TUTOR + (p.json ? '\nOutput only valid JSON.' : ''), prompt: p.text, temperature: 0.45, maxTokens: p.max, fallback: false }); } catch (e2) { console.warn('[fedha] study AI nvidia failed:', e2.status, e2.message); }
    }
    if (!raw) return res.status(e.status === 429 ? 429 : 500).json({ error: e.status === 429 ? 'The free AI tiers are busy right now. Try again in a minute.' : 'The AI could not answer right now.' });
  }
  if (!p.json) return res.status(200).json({ text: raw.trim() });
  const obj = parseJSON(raw);
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
  return res.status(200).json(obj);
}
