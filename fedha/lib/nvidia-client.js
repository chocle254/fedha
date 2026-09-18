// lib/nvidia-client.js — thin wrapper around NVIDIA NIM's OpenAI-compatible
// chat completions endpoint (https://integrate.api.nvidia.com/v1). Used only
// for the two spots that used to call groq/compound for web search
// (lib/jarvis-research-core.js and the activities/opportunities branch of
// pages/api/ai.js) — everywhere else in the app still calls Groq's plain
// openai/gpt-oss-120b directly, unchanged. NIM has no built-in search tool,
// so this is a plain synthesis call: real results come from
// lib/brave-search.js and get folded into the prompt before this runs.
//
// Get a free API key at build.nvidia.com (sign in, open a model card, "Get
// API Key" — starts with nvapi-). Set NVIDIA_API_KEY in your environment.

const NVIDIA_MODEL = process.env.NVIDIA_MODEL || 'nvidia/nemotron-3-super-120b-a12b';

async function callNvidiaOnce({ prompt, temperature, maxTokens }) {
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
      messages: [{ role: 'user', content: prompt }],
      chat_template_kwargs: { enable_thinking: false },
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

export async function nvidiaChat({ prompt, temperature = 0.5, maxTokens = 900 }) {
  const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
  if (!NVIDIA_API_KEY) throw new Error('NVIDIA_API_KEY not set in environment variables');

  // NVIDIA's own forum staff confirm the free/no-cost trial tier of NIM can
  // genuinely run out of capacity under load ("you may experience extended
  // wait times during periods of high load" — forums.developer.nvidia.com/
  // t/324036), separately from account-level 429 rate limiting. Both come
  // back as real HTTP errors (503-style "temporarily overloaded" text, or
  // 429), and unlike Groq there's no smaller/cheaper NIM model tier to
  // fall back to here — so the practical mitigation is a couple of retries
  // with backoff rather than failing on the very first hiccup.
  const RETRYABLE = new Set([429, 500, 502, 503, 504]);
  const MAX_ATTEMPTS = 3;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await callNvidiaOnce({ prompt, temperature, maxTokens });
    } catch (e) {
      lastErr = e;
      if (!RETRYABLE.has(e.status) || attempt === MAX_ATTEMPTS) throw e;
      const delayMs = 800 * attempt; // 800ms, then 1600ms
      console.warn(`[fedha] NVIDIA NIM attempt ${attempt} failed (${e.status}), retrying in ${delayMs}ms...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}
