// pages/api/learn-opps.js — researches free and sponsored learning on the live web: fully funded bootcamps,
// free courses with certificates, scholarships, fellowships, hackathons and excellence programmes, open to
// someone in Kenya (or online). Real search results first (Firecrawl, lib/web-search.js), then the AI only
// sorts and describes them. Any item whose link did not come from the search is dropped, so nothing is made up.
//
// POST { interests: ["Machine learning", ...], focus: "all"|"bootcamp"|"course"|"scholarship"|"hackathon"|"fellowship" }
// → { items: [...], searched: n }
import { requireUser } from '../../lib/require-user';
import { webSearchMulti } from '../../lib/web-search';
import { nvidiaChat, nvidiaAvailable } from '../../lib/nvidia-client';

export const config = { maxDuration: 60 };
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const KINDS = ['bootcamp', 'course', 'scholarship', 'fellowship', 'hackathon', 'program'];
const clip = (v, n) => String(v ?? '').slice(0, n);

function queries(interests, focus) {
  const year = new Date().getFullYear();
  const topic = interests.slice(0, 2).join(' ') || 'software engineering AI';
  const all = {
    bootcamp: [`fully sponsored tech bootcamp Kenya ${year} apply`, `free ${topic} bootcamp Africa ${year} scholarship`],
    course: [`free ${topic} course with free certificate ${year}`, `KITI Kenya free training programme ${year}`],
    scholarship: [`fully funded tech scholarship Kenya ${year} applications open`],
    fellowship: [`tech fellowship Africa ${year} applications open young developers`],
    hackathon: [`hackathon Kenya ${year} register prize`, `${topic} hackathon online ${year} open to Africa`],
    program: [`centre of excellence tech training programme Kenya ${year} free`, `ALX Power Learn Project Moringa sponsored programme ${year} intake`],
  };
  if (focus && all[focus]) return [...all[focus], ...(focus === 'course' ? [] : [`free ${topic} ${focus} ${year} Kenya`])];
  return [all.bootcamp[0], all.course[0], all.course[1], all.scholarship[0], all.hackathon[0], all.program[0], all.program[1], all.fellowship[0]];
}

async function groqJSON(key, system, text) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: GROQ_MODEL, temperature: 0.2, max_tokens: 4000, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: text }] }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.error?.message || 'Groq error'); e.status = r.status; throw e; }
  return d.choices?.[0]?.message?.content || '';
}
const parseJSON = (t) => { try { return JSON.parse(t); } catch { const m = String(t).match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } } };
const norm = (u) => String(u || '').trim().replace(/[#?].*$/, '').replace(/\/+$/, '').toLowerCase();

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const interests = (Array.isArray(req.body?.interests) ? req.body.interests : []).map((s) => clip(s, 80)).filter(Boolean).slice(0, 6);
  const focus = KINDS.includes(req.body?.focus) ? req.body.focus : 'all';

  let found;
  try { found = await webSearchMulti(queries(interests, focus), { limitEach: 6 }); }
  catch (e) { console.warn('[fedha] learn-opps search failed:', e.status, e.message); return res.status(502).json({ error: 'The web search is not answering right now. Try again in a minute.' }); }

  const today = new Date().toISOString().slice(0, 10);
  const system = 'You sort real web search results into learning opportunities. Use only facts in the results. Never invent a link, date, price or sponsor. Output only valid JSON.';
  const text = `Today is ${today}. The learner is in Kenya and studies: ${interests.join(', ') || 'software, AI and tech'}.
From these search results, pick the real, specific opportunities (one programme, course, bootcamp, scholarship, fellowship or hackathon each). Skip list articles, ads, paid-only courses, expired ones (deadline before today) and anything not open to someone in Kenya or online.
For each give:
- title: the programme's own name
- org: who runs or sponsors it
- kind: one of ${KINDS.join(', ')}
- cost: "Free", "Fully sponsored", "Free certificate", "Stipend", or a short note
- deadline: YYYY-MM-DD only if the results state it, else ""
- where: "Online", a city, or "Kenya"
- url: copied exactly from the results
- why: one plain sentence on what you get and who it suits
- match: 0-100, how well it fits what the learner studies
Return JSON: {"items":[...]} with up to 18 items, best match first.

SEARCH RESULTS:
${found.text.slice(0, 16000)}`;

  let raw = '';
  try {
    if (!process.env.GROQ_API_KEY) throw Object.assign(new Error('GROQ_API_KEY not set'), { status: 500 });
    raw = await groqJSON(process.env.GROQ_API_KEY, system, text);
  } catch (e) {
    console.warn('[fedha] learn-opps groq failed:', e.status, e.message);
    if (nvidiaAvailable()) { try { raw = await nvidiaChat({ system, prompt: text, temperature: 0.2, maxTokens: 4000, fallback: false }); } catch (e2) { console.warn('[fedha] learn-opps nvidia failed:', e2.message); } }
    if (!raw) return res.status(e.status === 429 ? 429 : 500).json({ error: e.status === 429 ? 'The free AI tiers are busy right now. Try again in a minute.' : 'The AI could not sort the results right now.' });
  }
  const obj = parseJSON(raw);
  const real = new Map(found.citations.map((u) => [norm(u), u]));
  const seen = new Set();
  const items = (obj?.items || [])
    .filter((it) => it?.title && real.has(norm(it.url)))
    .filter((it) => !it.deadline || !/^\d{4}-\d{2}-\d{2}$/.test(it.deadline) || it.deadline >= today)
    .filter((it) => { const k = norm(it.url); if (seen.has(k)) return false; seen.add(k); return true; })
    .map((it) => ({
      title: clip(it.title, 140), org: clip(it.org, 80), kind: KINDS.includes(it.kind) ? it.kind : 'program',
      cost: clip(it.cost, 40) || 'Free', deadline: /^\d{4}-\d{2}-\d{2}$/.test(it.deadline || '') ? it.deadline : '',
      where: clip(it.where, 40), url: real.get(norm(it.url)), why: clip(it.why, 260), match: Math.max(0, Math.min(100, Number(it.match) || 0)),
    }))
    .slice(0, 18);
  return res.status(200).json({ items, searched: found.citations.length });
}
