// lib/nvidia-client.js — thin wrapper around NVIDIA NIM's OpenAI-compatible
// chat completions endpoint (https://integrate.api.nvidia.com/v1). Groq and NVIDIA back each other up:
// the hackathon coach shares its load across both, and Groq calls fall over to NVIDIA when rate limited.
// Originally used for the two spots that used to call groq/compound for web search
// (lib/jarvis-research-core.js and the activities/opportunities branch of
// pages/api/ai.js) — everywhere else in the app still calls Groq's plain
// openai/gpt-oss-120b directly, unchanged. NIM has no built-in search tool,
// so this is a plain synthesis call: real results come from
// lib/brave-search.js and get folded into the prompt before this runs.
//
// Get a free API key at build.nvidia.com (sign in, open a model card, "Get
// API Key" — starts with nvapi-). Set NVIDIA_API_KEY in your environment.

// NVIDIA moves models around: a model can stay listed but stop being served for an account
// ("Function ... Not found for account", HTTP 404). So try a short list, remember the first one
// that answers, and if none do, fall back to Groq (which the rest of the app already uses).
const NVIDIA_MODELS = [
  process.env.NVIDIA_MODEL,
  'nvidia/nemotron-3-super-120b-a12b',
  'nvidia/nemotron-3.5-lightning-30b-a3b',
  'moonshotai/kimi-k2.6',
  'deepseek-ai/deepseek-v4.1-flash',
  'openai/gpt-oss-20b',
].filter((m, i, a) => m && a.indexOf(m) === i);
let workingModel = null; // remembered while this server instance is warm
const deadModels = new Set();

async function callNvidiaOnce({ prompt, system, temperature, maxTokens, model: NVIDIA_MODEL }) {
  const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
  const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${NVIDIA_API_KEY}`,
    },
    body: JSON.stringify({
      model: NVIDIA_MODEL,
      temperature,
      max_tokens: maxTokens,
      messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }],
      ...(/nemotron/.test(NVIDIA_MODEL) ? { chat_template_kwargs: { enable_thinking: false } } : {}),
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error(`[fedha] NVIDIA NIM (${NVIDIA_MODEL}) request failed:`, response.status, JSON.stringify(data.error || data));
    const err = new Error(data.error?.message || 'NVIDIA NIM API error');
    err.status = response.status;
    throw err;
  }

  const message = data.choices?.[0]?.message;
  if (message?.reasoning_content) {
    console.warn('[fedha] NVIDIA NIM returned reasoning_content despite enable_thinking:false — first 200 chars:', message.reasoning_content.slice(0, 200));
  }

  return message?.content || '';
}

async function withRetries(fn) {
  const RETRYABLE = new Set([429, 500, 502, 503, 504]);
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      if (!RETRYABLE.has(e.status) || attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
  throw lastErr;
}

// Last resort: Groq's chat model. Its free tier has a smaller per-minute token budget, so very long
// prompts (lots of search results) are trimmed to fit.
async function groqFallback({ prompt, temperature, maxTokens }) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw Object.assign(new Error('No working AI model (NVIDIA failed and GROQ_API_KEY is not set)'), { status: 503 });
  const model = process.env.GROQ_FALLBACK_MODEL || process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  const text = prompt.length > 22000 ? `${prompt.slice(0, 15000)}\n…\n${prompt.slice(-6000)}` : prompt;
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, temperature, max_tokens: Math.min(maxTokens, 4000), messages: [{ role: 'user', content: text }] }),
  });
  const data = await r.json();
  if (!r.ok) {
    console.error(`[fedha] Groq fallback (${model}) failed:`, r.status, JSON.stringify(data.error || data));
    throw Object.assign(new Error(data.error?.message || 'Groq API error'), { status: r.status });
  }
  return data.choices?.[0]?.message?.content || '';
}

export const nvidiaAvailable = () => !!process.env.NVIDIA_API_KEY;

// fallback: false = throw instead of falling back to Groq (used when Groq itself is the one rate limited,
// so the two providers back each other up without bouncing a request back and forth).
export async function nvidiaChat({ prompt, system = '', temperature = 0.5, maxTokens = 900, fallback = true }) {
  const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
  const order = workingModel ? [workingModel, ...NVIDIA_MODELS.filter((m) => m !== workingModel)] : NVIDIA_MODELS;
  if (NVIDIA_API_KEY) {
    for (const model of order) {
      if (deadModels.has(model)) continue;
      try {
        const out = await withRetries(() => callNvidiaOnce({ prompt, system, temperature, maxTokens, model }));
        if (out) { workingModel = model; return out; }
      } catch (e) {
        // 404 / 400 / 403: this model isn't available to this account. Try the next one.
        if ([400, 403, 404, 410, 422].includes(e.status)) { deadModels.add(model); continue; }
        console.warn(`[fedha] NVIDIA ${model} failed (${e.status}); trying the next model`);
      }
    }
  }
  if (!fallback) throw Object.assign(new Error('NVIDIA is unavailable right now'), { status: 503 });
  return groqFallback({ prompt: system ? `${system}\n\n${prompt}` : prompt, temperature, maxTokens });
}
