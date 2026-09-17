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

export async function nvidiaChat({ prompt, temperature = 0.5, maxTokens = 900 }) {
  const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
  if (!NVIDIA_API_KEY) throw new Error('NVIDIA_API_KEY not set in environment variables');

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
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error(`[fedha] NVIDIA NIM (${NVIDIA_MODEL}) request failed:`, response.status, JSON.stringify(data.error || data));
    const err = new Error(data.error?.message || 'NVIDIA NIM API error');
    err.status = response.status;
    throw err;
  }

  return data.choices?.[0]?.message?.content || '';
}
