// pages/api/ai.js — uses Groq (free, generous, OpenAI-compatible). Set GROQ_API_KEY.
const GROQ_MODEL = 'llama-3.3-70b-versatile'; // free & strong; or 'llama-3.1-8b-instant' for speed

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set in environment variables' });

  const { type, balance, currency, location, dateMode, budgets, currency_symbol } = req.body;
  let prompt = '';

  if (type === 'activities') {
    const locationStr = location?.city
      ? `The user is near: ${location.city} (coordinates: ${location.lat}, ${location.lng}).`
      : `No location provided — suggest general affordable activities.`;
    const modeStr = dateMode
      ? `This is for a romantic date — suggest couple-friendly, fun, memorable date activities.`
      : `This is for personal enjoyment — suggest fun solo or social activities.`;
    prompt = `You are a fun personal finance assistant helping someone enjoy their money wisely.

${locationStr}
${modeStr}

The user has ${currency_symbol}${balance} in floating cash available (after all budgets).
Budgets already set: ${budgets?.length ? budgets.map(b => b.name + ' (' + b.period + ')').join(', ') : 'none'}.

Suggest real, current activities, venues, restaurants or experiences near their location that fit their budget. If in Kenya, suggest Kenya-specific places.

Return a JSON object: { "results": [ ...6 items ] }. Each item has exactly:
- id (string like "act_1"), title, emoji, description (1-2 sentences, mention real place names),
- estimated_cost (number in ${currency}), category (one of "food","outdoor","entertainment","social","relaxation","adventure"),
- why_now (short fun reason), is_free (boolean).`;
  }

  if (type === 'opportunities') {
    prompt = `You are a smart income assistant helping someone in Kenya find legitimate online ways to earn money.

The user currently has ${currency_symbol}${balance} available in ${currency}.

Suggest real, current, legitimate online earning opportunities doable from a phone or basic computer, accessible from Kenya/Africa, active in 2026, with no large upfront cost.

Return a JSON object: { "results": [ ...6 items ] }. Each item has exactly:
- id (string like "opp_1"), title, emoji, platform, description (2-3 sentences),
- estimated_earnings (string like "KSh 500-2,000 per task"), estimated_amount (number, realistic middle estimate in ${currency}),
- time_required (string), difficulty (one of "Easy","Medium","Hard"), link_hint (website/app name).`;
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.8,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You output only valid JSON. No markdown, no commentary.' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: data.error?.message || 'Groq API error' });

    const rawText = data.choices?.[0]?.message?.content || '';
    if (!rawText) return res.status(500).json({ error: 'Empty response from Groq' });

    let parsed;
    try {
      const obj = JSON.parse(rawText);
      parsed = Array.isArray(obj) ? obj : obj.results || obj.items || obj.data || [];
    } catch {
      const m = rawText.match(/\[[\s\S]*\]/);
      if (!m) return res.status(500).json({ error: 'Could not parse AI response', raw: rawText });
      parsed = JSON.parse(m[0]);
    }
    return res.status(200).json({ results: parsed });
  } catch (err) {
    console.error('AI route error:', err);
    return res.status(500).json({ error: err.message });
  }
}
