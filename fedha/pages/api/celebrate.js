// pages/api/celebrate.js — Luxe's birthday AI: the birthday letter (written from your real year in Luxe) and a
// birthday day plan that fits your budget. Groq first, NVIDIA as backup (same pairing as pages/api/study.js).
//
// POST { type: 'letter', age, facts } → { letter }
// POST { type: 'plan', age, budget, wishes, likes, city } → { plan: { title, budget, items: [{ time, title, emoji, minutes, cost, note }] } }
import { requireUser } from '../../lib/require-user';
import { nvidiaChat, nvidiaAvailable } from '../../lib/nvidia-client';

export const config = { maxDuration: 60 };
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const clip = (v, n) => String(v ?? '').slice(0, n);
const nth = (n) => { const v = n % 100; return n + (v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'); };
const SYSTEM = `You are Luxe, a personal app that has watched this person's year closely: their money, studies and goals. Plain English, warm and real, never cheesy, no slang or local dialect. Honest: celebrate what they actually did (use the numbers), name what is still ahead without lecturing. Never invent facts that are not given.`;

async function ask(text, json) {
  let raw = '';
  try {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw Object.assign(new Error('GROQ_API_KEY not set'), { status: 500 });
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: GROQ_MODEL, temperature: 0.8, max_tokens: 1800, ...(json ? { response_format: { type: 'json_object' } } : {}), messages: [{ role: 'system', content: SYSTEM + (json ? '\nOutput only valid JSON.' : '') }, { role: 'user', content: text }] }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.error?.message || 'Groq error'), { status: r.status });
    raw = d.choices?.[0]?.message?.content || '';
  } catch (e) {
    if (nvidiaAvailable()) { try { raw = await nvidiaChat({ system: SYSTEM, prompt: text, temperature: 0.8, maxTokens: 1800, fallback: false }); } catch { /* both down */ } }
    if (!raw) throw e;
  }
  return raw;
}
const parse = (t) => { try { return JSON.parse(t); } catch { const m = String(t).match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } } };

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const b = req.body || {};
  const age = Math.max(1, Math.min(120, Number(b.age) || 25));
  try {
    if (b.type === 'letter') {
      const facts = (Array.isArray(b.facts) ? b.facts : []).map((f) => `- ${clip(f, 200)}`).slice(0, 25).join('\n');
      const text = `Today is their ${nth(age)} birthday. Write them a birthday letter from Luxe.
What their year looked like in Luxe:
${facts || '- They have been building their life with Luxe this year.'}
They are self-taught, learning AI/ML and cybersecurity, trading, saving, and building big things.
Write 170-230 words: open with a warm happy birthday, then what they genuinely achieved this year (use the real numbers), one honest line on what is still ahead, and finish with 3 short wishes for age ${age} as a list (each starting with "May"). Sign off as "— Luxe". Markdown allowed, no emoji except one at the very start.`;
      const letter = (await ask(text, false)).trim();
      return res.status(200).json({ letter: clip(letter, 3000) });
    }
    if (b.type === 'plan') {
      const text = `Plan their ${nth(age)} birthday (in or near ${clip(b.city, 60) || 'Nairobi, Kenya'}). Budget: about KSh ${Math.max(0, Math.round(Number(b.budget) || 0))} total (stay within it; free things count).
Their wishes: ${(Array.isArray(b.wishes) ? b.wishes : []).map((w) => clip(w, 80)).join('; ') || 'none listed'}.
What they enjoy: ${clip(b.likes, 300) || 'music, building things, good food, a little adventure, time to reflect'}.
Make it feel special, not generic: a slow good morning, something fun or adventurous, a treat meal, a moment to reflect and set goals for the year, an evening they will remember. 5-8 items across the day.
Return JSON: {"plan":{"title":"","budget":0,"items":[{"time":"HH:MM","title":"","emoji":"","minutes":60,"cost":0,"note":"one helpful line"}]}}`;
      const obj = parse(await ask(text, true));
      const items = (obj?.plan?.items || []).filter((x) => x?.title && /^\d{1,2}:\d{2}$/.test(x.time || '')).slice(0, 9).map((x) => ({
        time: x.time.padStart(5, '0'), title: clip(x.title, 80), emoji: clip(x.emoji, 6) || '🎉', minutes: Math.max(15, Math.min(300, Number(x.minutes) || 60)), cost: Math.max(0, Math.round(Number(x.cost) || 0)), note: clip(x.note, 160),
      }));
      if (!items.length) return res.status(500).json({ error: 'No plan came back. Try again.' });
      return res.status(200).json({ plan: { title: clip(obj.plan.title, 80) || `Your ${nth(age)} birthday`, budget: items.reduce((s, x) => s + x.cost, 0), items } });
    }
    return res.status(400).json({ error: 'Unknown type' });
  } catch (e) {
    return res.status(e.status === 429 ? 429 : 500).json({ error: e.status === 429 ? 'The AI is busy right now. Try again in a minute.' : 'The AI could not answer right now.' });
  }
}
