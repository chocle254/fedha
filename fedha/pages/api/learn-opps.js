// pages/api/learn-opps.js — researches free and sponsored learning on the live web: fully funded bootcamps,
// free courses with certificates, scholarships, fellowships and excellence programmes (no hackathons: the
// Tech Hub has those), open to
// someone in Kenya (or online). Real search results first (Firecrawl, lib/web-search.js), then the AI only
// sorts and describes them. Any item whose link did not come from the search is dropped, so nothing is made up.
//
// POST { interests: ["Machine learning", ...], focus: "all"|"bootcamp"|"course"|"scholarship"|"fellowship"|"program" }
// → { items: [...], searched: n }
import { requireUser } from '../../lib/require-user';
import { webSearchMulti } from '../../lib/web-search';
import { nvidiaChat, nvidiaAvailable } from '../../lib/nvidia-client';

export const config = { maxDuration: 60 };
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const KINDS = ['bootcamp', 'course', 'scholarship', 'fellowship', 'program'];
const clip = (v, n) => String(v ?? '').slice(0, n);

// Searches built around the learner's fields (default AI/ML and cybersecurity) and around being self-taught:
// every query asks for programmes that need no degree, so university-only offers mostly never show up.
function queries(fields, focus) {
  const year = new Date().getFullYear();
  const fs = fields.length ? fields.slice(0, 3) : ['AI and machine learning', 'cybersecurity'];
  const per = (f) => ({
    bootcamp: [`fully sponsored ${f} bootcamp Kenya ${year} no degree required`, `free residential ${f} bootcamp Africa ${year} accommodation meals provided`],
    course: [`free ${f} course with free certificate ${year} self-taught beginners`],
    scholarship: [`${f} scholarship ${year} open to self-taught non-students Africa`],
    fellowship: [`${f} fellowship ${year} Africa no degree required applications open`],
    program: [`${f} training programme Kenya ${year} free open to youth not university`],
  });
  if (focus && KINDS.includes(focus)) return fs.flatMap((f) => per(f)[focus]).concat(focus === 'program' ? [`KITI Kenya free ${fs[0]} training ${year}`] : []).slice(0, 8);
  return [
    ...fs.flatMap((f) => [per(f).bootcamp[0], per(f).bootcamp[1], per(f).course[0]]),
    `fully funded ${fs.join(' or ')} programme Africa ${year} self-taught apply`,
    `KITI Kenya free ${fs[0]} training ${year}`,
    `${fs[0]} fellowship ${year} Africa no degree required`,
  ].slice(0, 10);
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
const perk = (it) => (it.stay && it.meals ? 4 : 0) + (it.stay ? 2 : 0) + (it.meals ? 1 : 0) + (it.stipend ? 0.5 : 0);
const norm = (u) => String(u || '').trim().replace(/[#?].*$/, '').replace(/\/+$/, '').toLowerCase();

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const interests = (Array.isArray(req.body?.interests) ? req.body.interests : []).map((s) => clip(s, 80)).filter(Boolean).slice(0, 6);
  const fields = (Array.isArray(req.body?.fields) ? req.body.fields : []).map((s) => clip(s, 60)).filter(Boolean).slice(0, 4);
  const focus = KINDS.includes(req.body?.focus) ? req.body.focus : 'all';

  let found;
  try { found = await webSearchMulti(queries(fields, focus), { limitEach: 6 }); }
  catch (e) { console.warn('[fedha] learn-opps search failed:', e.status, e.message); return res.status(502).json({ error: 'The web search is not answering right now. Try again in a minute.' }); }

  const today = new Date().toISOString().slice(0, 10);
  const system = 'You sort real web search results into learning opportunities. Use only facts in the results. Never invent a link, date, price or sponsor. Output only valid JSON.';
  const text = `Today is ${today}. The learner is in Kenya, SELF-TAUGHT, with NO university degree and NOT enrolled at a university. Their fields: ${(fields.length ? fields : ['AI and machine learning', 'cybersecurity']).join(', ')}${interests.length ? ` (current courses: ${interests.join(', ')})` : ''}.
From these search results, pick the real, specific opportunities (one programme, course, bootcamp, scholarship or fellowship each) in those fields.
Skip: anything that requires a bachelor's or other degree, current university or college enrolment, being a graduate, or a university nomination; anything outside their fields (general business, teaching, health etc.); hackathons and competitions; list articles, ads, paid-only courses, expired ones (deadline before today) and anything not open to someone in Kenya or online.
For each give:
- title: the programme's own name
- org: who runs or sponsors it
- kind: one of ${KINDS.join(', ')}
- cost: "Free", "Fully sponsored", "Free certificate", "Stipend", or a short note
- deadline: YYYY-MM-DD only if the results state it, else ""
- where: "Online", a city, or "Kenya"
- url: copied exactly from the results
- why: one plain sentence on what you get and who it suits
- field: which of their fields it fits
- open: "anyone" if self-taught people with no degree can apply, "degree" if it needs a degree or university enrolment, "unclear" if the results do not say
- eligibility: who can apply, in a few words from the results (e.g. "Kenyans 18-35, no degree needed")
- match: 0-100, how well it fits their fields (under 40 if it is only loosely related)
- stay: true only if the results say accommodation (housing, residential, hostel) is provided free
- meals: true only if the results say meals or food are provided free
- stipend: true only if the results mention a stipend, allowance or travel paid
Return JSON: {"items":[...]} with up to 18 items. Programmes that give free accommodation and meals come first, then best match.

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
    .filter((it) => it.open !== 'degree' && (Number(it.match) || 0) >= 40) // self-taught: no degree-only offers, nothing off-field
    .filter((it) => !it.deadline || !/^\d{4}-\d{2}-\d{2}$/.test(it.deadline) || it.deadline >= today)
    .filter((it) => { const k = norm(it.url); if (seen.has(k)) return false; seen.add(k); return true; })
    .map((it) => ({
      title: clip(it.title, 140), org: clip(it.org, 80), kind: KINDS.includes(it.kind) ? it.kind : 'program',
      cost: clip(it.cost, 40) || 'Free', deadline: /^\d{4}-\d{2}-\d{2}$/.test(it.deadline || '') ? it.deadline : '',
      where: clip(it.where, 40), url: real.get(norm(it.url)), why: clip(it.why, 260), match: Math.max(0, Math.min(100, Number(it.match) || 0)),
      field: clip(it.field, 50), open: it.open === 'anyone' ? 'anyone' : 'unclear', eligibility: clip(it.eligibility, 120),
      stay: it.stay === true, meals: it.meals === true, stipend: it.stipend === true,
    }))
    // Full accommodation and meals first, then housing or meals alone, then the rest by match.
    .sort((a, b) => (perk(b) - perk(a)) || ((b.open === 'anyone') - (a.open === 'anyone')) || (b.match - a.match))
    .slice(0, 18);
  return res.status(200).json({ items, searched: found.citations.length });
}
