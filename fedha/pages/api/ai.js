// pages/api/ai.js// pages/api/ai.js
// Uses Google Gemini API — free tier, no credit card needed

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not set in environment variables' });
  }

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

The user has ${currency_symbol}${balance} in floating cash available (after all budgets and commitments).
Budgets already set: ${budgets?.length ? budgets.map(b => b.name + ' (' + b.period + ')').join(', ') : 'none'}.

Suggest real, current activities, venues, restaurants, or experiences near their location that fit their budget. If in Kenya, suggest Kenya-specific places and activities.

Respond ONLY with a valid JSON array (no markdown, no explanation, no code fences) of 6 activity suggestions. Each object must have exactly these fields:
- id: unique string like "act_1"
- title: short name
- emoji: one relevant emoji
- description: 1-2 sentence description, mention actual place names if possible
- estimated_cost: number in ${currency}
- category: one of "food", "outdoor", "entertainment", "social", "relaxation", "adventure"
- why_now: short fun reason to do it today
- is_free: boolean

Return ONLY the JSON array, nothing else.`;
  }

  if (type === 'opportunities') {
    prompt = `You are a smart income assistant helping someone find legitimate online ways to earn money.

The user currently has ${currency_symbol}${balance} available balance in ${currency}.
They are based in Kenya and looking for online income opportunities they can start quickly from a phone or basic computer.

Suggest real, current, legitimate online earning opportunities — gigs, tasks, freelance work, micro-jobs, selling, etc. that:
- Can be done from a phone or basic computer
- Are available in or accessible from Kenya/Africa
- Have realistic earning potential
- Don't require large upfront investment
- Are working and active in 2026

Respond ONLY with a valid JSON array (no markdown, no explanation, no code fences) of 6 opportunities. Each object must have exactly these fields:
- id: unique string like "opp_1"
- title: short name
- emoji: one relevant emoji
- platform: name of the platform or app
- description: 2-3 sentences explaining what to do and how to get started
- estimated_earnings: string like "KSh 500-2,000 per task"
- estimated_amount: number (realistic middle estimate in ${currency})
- time_required: string like "2-4 hours" or "Ongoing"
- difficulty: exactly one of "Easy", "Medium", or "Hard"
- link_hint: the website or app name to search for

Return ONLY the JSON array, nothing else.`;
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 2000,
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data.error?.message || 'Gemini API error';
      return res.status(500).json({ error: errMsg });
    }

    // Extract text from Gemini response
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!rawText) {
      return res.status(500).json({ error: 'Empty response from Gemini' });
    }

    // Strip markdown fences if present
    const cleaned = rawText.replace(/```json|```/g, '').trim();

    // Find the JSON array
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Could not parse AI response', raw: rawText });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return res.status(200).json({ results: parsed });

  } catch (err) {
    console.error('AI route error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// Server-side API route — keeps your Anthropic API key secure

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in environment variables' });
  }

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

The user has ${currency_symbol}${balance} in floating cash available (after all budgets and commitments).
Budgets already set: ${budgets?.length ? budgets.map(b => b.name + ' (' + b.period + ')').join(', ') : 'none'}.

Search the web for real, current activities, venues, restaurants, or experiences near their location that fit their budget.

Respond ONLY with a valid JSON array (no markdown, no explanation) of 6 activity suggestions. Each object must have:
- id: unique string like "act_1"
- title: short name
- emoji: one relevant emoji
- description: 1-2 sentence description, mention actual place names if possible
- estimated_cost: number (in ${currency})
- category: one of "food", "outdoor", "entertainment", "social", "relaxation", "adventure"
- why_now: short fun reason to do it today
- is_free: boolean`;
  }

  if (type === 'opportunities') {
    prompt = `You are a smart income assistant helping someone find legitimate online ways to earn money.

The user currently has ${currency_symbol}${balance} available balance in ${currency}.
They are looking for online income opportunities they can start quickly.

Search the web for current, real, legitimate online earning opportunities — gigs, tasks, freelance work, micro-jobs, selling, etc. that:
- Can be done from a phone or basic computer
- Are available in or accessible from Kenya/Africa
- Have realistic earning potential
- Don't require large upfront investment

Respond ONLY with a valid JSON array (no markdown, no explanation) of 6 opportunities. Each object must have:
- id: unique string like "opp_1"  
- title: short name
- emoji: one relevant emoji
- platform: name of the platform/app/site
- description: 2-3 sentences explaining what to do and how to get started
- estimated_earnings: string like "KSh 500–2,000 per task" or "KSh 3,000–8,000/month"
- estimated_amount: number (realistic middle estimate in ${currency})
- time_required: string like "2–4 hours" or "Ongoing"
- difficulty: "Easy" | "Medium" | "Hard"
- link_hint: the website or app name to search for`;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: data.error?.message || 'Anthropic API error' });
    }

    // Extract text from response (may include tool_use blocks, we want the final text)
    const textBlocks = data.content?.filter((b) => b.type === 'text') || [];
    const rawText = textBlocks.map((b) => b.text).join('');

    // Parse JSON — strip any accidental markdown fences
    const cleaned = rawText.replace(/```json|```/g, '').trim();
    
    // Find the JSON array in the response
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Could not parse AI response', raw: rawText });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return res.status(200).json({ results: parsed });

  } catch (err) {
    console.error('AI route error:', err);
    return res.status(500).json({ error: err.message });
  }
}
