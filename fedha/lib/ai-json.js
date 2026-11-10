// lib/ai-json.js — one question to the AI, one JSON object back (or null). Groq first, NVIDIA if Groq fails.
// Used by the trading desk (follow-up reader, market read, daily review), where a missing answer must never
// stop a trade from being handled: callers always have a plan for null.
import { nvidiaChat, nvidiaAvailable } from './nvidia-client';

const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const FAST = process.env.GROQ_FALLBACK_MODEL || 'openai/gpt-oss-20b';

export function parseObject(raw) {
  const clean = String(raw || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try { return JSON.parse(clean); } catch { /* try the outermost object */ }
  const s = clean.indexOf('{'); const e = clean.lastIndexOf('}');
  if (s === -1 || e <= s) return null;
  try { return JSON.parse(clean.slice(s, e + 1)); } catch { return null; }
}

async function groqOnce(prompt, { model, maxTokens, temperature, timeout }) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model, temperature, max_tokens: maxTokens, response_format: { type: 'json_object' },
      ...(/gpt-oss/.test(model) ? { reasoning_effort: 'low' } : {}),
      messages: [{ role: 'system', content: 'You output only valid JSON. No markdown, no commentary.' }, { role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(timeout),
  });
  if (!r.ok) return null;
  const d = await r.json().catch(() => ({}));
  return parseObject(d.choices?.[0]?.message?.content || '');
}

// fast: true = the small quick model (reading one short message); otherwise the main model.
export async function aiJSON(prompt, { fast = false, maxTokens = 1200, temperature = 0.2, timeout = 20000 } = {}) {
  const order = fast ? [FAST, MODEL] : [MODEL, FAST];
  for (const model of order) {
    try { const o = await groqOnce(prompt, { model, maxTokens, temperature, timeout }); if (o) return o; } catch { /* next */ }
  }
  if (nvidiaAvailable()) {
    try { return parseObject(await nvidiaChat({ prompt, system: 'You output only valid JSON. No markdown, no commentary.', temperature, maxTokens, fallback: false })); } catch { /* none */ }
  }
  return null;
}
