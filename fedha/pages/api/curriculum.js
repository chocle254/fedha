// pages/api/curriculum.js — builds a course's curriculum so you never type lessons one by one.
//   mode 'url'    reads the course page (Firecrawl scrape, keyless; falls back to fetching the HTML) and extracts it
//   mode 'text'   tidies a syllabus you copied and pasted from the course site
//   mode 'image'  reads screenshots of the curriculum (Groq vision model), for sites behind a login
//   mode 'design' designs a sensible curriculum from the course name and description (marked as AI-designed)
// POST { mode, url?, text?, images?: [dataURL], title?, provider?, description? }
// → { sections: [{ title, lessons: [{ title, type, minutes, url }] }], source, note? }
import { requireUser } from '../../lib/require-user';
import { nvidiaChat, nvidiaAvailable } from '../../lib/nvidia-client';

export const config = { maxDuration: 60, api: { bodyParser: { sizeLimit: '4mb' } } };
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const VISION_MODEL = process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
const TYPES = ['video', 'check', 'reading', 'assessment', 'other'];
const clip = (v, n) => String(v ?? '').slice(0, n);

const SHAPE = `Return JSON: {"sections":[{"title":"section name","lessons":[{"title":"lesson title","type":"video|check|reading|assessment|other","minutes":10,"url":""}]}]}
Rules: keep the course's own order and exact lesson titles. type: video for videos/lectures, reading for articles/readings/docs, check for quizzes/knowledge checks/practice questions, assessment for graded exams/projects/final assessments, other for labs, assignments or anything else. minutes: use the stated duration (convert "1h 5m" to 65); if none is given, estimate (video 8, reading 10, check 5, assessment 30, lab 30). url: a lesson link only if it appears in the material, else "". No invented lessons.`;

async function groqChat(messages, model = GROQ_MODEL, json = true) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({ model, temperature: 0.2, max_tokens: 6000, ...(json ? { response_format: { type: 'json_object' } } : {}), messages }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error?.message || 'Groq error'), { status: r.status });
  return d.choices?.[0]?.message?.content || '';
}
async function textAI(prompt) {
  const system = 'You turn course material into a clean curriculum. Output only valid JSON.';
  try { return await groqChat([{ role: 'system', content: system }, { role: 'user', content: prompt }]); }
  catch (e) {
    if (nvidiaAvailable()) { const t = await nvidiaChat({ system, prompt, temperature: 0.2, maxTokens: 6000, fallback: false }).catch(() => ''); if (t) return t; }
    throw e;
  }
}
const parse = (t) => { try { return JSON.parse(t); } catch { const m = String(t).match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } } };

// The course page as text: Firecrawl first (renders JavaScript pages), then a plain fetch.
async function readPage(url) {
  try {
    const r = await fetch('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(process.env.FIRECRAWL_API_KEY ? { Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}` } : {}) },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
      signal: AbortSignal.timeout(30000),
    });
    const d = await r.json().catch(() => ({}));
    const md = d?.data?.markdown || '';
    if (r.ok && md.length > 300) return md;
  } catch { /* try a plain fetch */ }
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Luxe curriculum reader)' }, signal: AbortSignal.timeout(15000) });
    const html = await r.text();
    return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<(li|h\d|p|br|div|tr)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  } catch { return ''; }
}

function clean(obj) {
  const sections = (Array.isArray(obj?.sections) ? obj.sections : []).slice(0, 40).map((s) => ({
    title: clip(s?.title, 120) || 'Course content',
    lessons: (Array.isArray(s?.lessons) ? s.lessons : []).filter((l) => l?.title).slice(0, 80).map((l) => ({
      title: clip(l.title, 160), type: TYPES.includes(l.type) ? l.type : 'video',
      minutes: Math.max(1, Math.min(600, Math.round(Number(l.minutes) || 10))), url: /^https?:\/\//.test(l.url || '') ? clip(l.url, 400) : '',
    })),
  })).filter((s) => s.lessons.length);
  return sections;
}

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set' });
  const b = req.body || {};
  const about = `Course: ${clip(b.title, 160) || 'unnamed'}${b.provider ? ` by ${clip(b.provider, 80)}` : ''}${b.description ? `\nAbout: ${clip(b.description, 600)}` : ''}`;
  try {
    let raw = '', source = b.mode, note;
    if (b.mode === 'url') {
      if (!/^https?:\/\//.test(b.url || '')) return res.status(400).json({ error: 'Add the course link first.' });
      const page = await readPage(b.url);
      if (page.length < 300) return res.status(422).json({ error: "That page didn't show its lessons (it may need a login). Paste the list or use screenshots instead." });
      raw = await textAI(`${about}\nThis is the course page. Extract its full curriculum (every section and every lesson, video, reading, quiz and lab). Ignore navigation, reviews, pricing and instructor bios.\n${SHAPE}\n\nPAGE:\n${page.slice(0, 40000)}`);
    } else if (b.mode === 'text') {
      if (String(b.text || '').trim().length < 20) return res.status(400).json({ error: 'Paste the lesson list first.' });
      raw = await textAI(`${about}\nThe learner copied this from the course site. Turn it into the curriculum.\n${SHAPE}\n\nCOPIED TEXT:\n${clip(b.text, 40000)}`);
    } else if (b.mode === 'image') {
      const imgs = (Array.isArray(b.images) ? b.images : []).filter((x) => /^data:image\//.test(x)).slice(0, 5);
      if (!imgs.length) return res.status(400).json({ error: 'Add a screenshot of the curriculum first.' });
      raw = await groqChat([
        { role: 'system', content: 'You read screenshots of online course curricula. Output only valid JSON.' },
        { role: 'user', content: [{ type: 'text', text: `${about}\nThese screenshots show the course's curriculum, in order. Read every section and lesson exactly as written, with durations.\n${SHAPE}` }, ...imgs.map((url) => ({ type: 'image_url', image_url: { url } }))] },
      ], VISION_MODEL);
    } else if (b.mode === 'design') {
      raw = await textAI(`${about}\nThere is no curriculum to copy, so design a solid one a self-taught learner can follow: 4-8 sections, 3-6 lessons each, in a sensible order, mixing videos or readings, practice checks and a final project. Use realistic minutes.\n${SHAPE}`);
      note = 'Designed by AI from the course name. Edit it to match the real course.';
    } else return res.status(400).json({ error: 'Unknown mode' });
    const sections = clean(parse(raw));
    if (!sections.length) return res.status(422).json({ error: 'No lessons could be found. Try pasting the list or screenshots.' });
    return res.status(200).json({ sections, source, note });
  } catch (e) {
    console.warn('[fedha] curriculum failed:', b.mode, e.status, e.message);
    return res.status(e.status === 429 ? 429 : 500).json({ error: e.status === 429 ? 'The AI is busy right now. Try again in a minute.' : b.mode === 'image' ? 'Could not read the screenshots. Try clearer ones, or paste the list.' : 'Could not build the curriculum right now.' });
  }
}
