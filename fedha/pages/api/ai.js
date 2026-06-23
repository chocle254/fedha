// pages/api/ai.js — uses Groq (free, generous, OpenAI-compatible). Set GROQ_API_KEY.
const GROQ_MODEL = 'llama-3.3-70b-versatile'; // free & strong; or 'llama-3.1-8b-instant' for speed
const GROQ_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'; // multimodal — accepts images

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set in environment variables' });

  const { type, balance, currency, location, dateMode, budgets, currency_symbol, nonce, startup, image, areas } = req.body;
  let prompt = '';

  const varietyStr = nonce ? `\nFreshness token: ${nonce}. Give a DIFFERENT, fresh set of ideas than you might usually pick — avoid repeating the obvious defaults.` : '';

  if (type === 'activities') {
    const locationStr = location?.city
      ? `The user is physically located in/near ${location.city} (GPS coordinates: ${location.lat}, ${location.lng}). EVERY single suggestion MUST be a real place, venue, event or experience that actually exists IN or very close to ${location.city} — within roughly 15km. Do NOT suggest places in other cities or other countries. If you are unsure of a specific venue name in ${location.city}, suggest a realistic type of spot that genuinely exists there (e.g. a popular local park, mall, eatery, or viewpoint in ${location.city}).`
      : `No location provided — suggest general affordable activities.`;
    const modeStr = dateMode
      ? `This is for a romantic date — suggest couple-friendly, fun, memorable, exciting date activities. Make them feel special and worth doing.`
      : `This is for personal enjoyment — suggest genuinely FUN, exciting solo or social activities the user will actually be excited to do. Avoid boring or generic suggestions like "go for a walk" unless paired with something specific and fun.`;
    prompt = `You are a fun, energetic local guide helping someone enjoy their money wisely.

${locationStr}
${modeStr}${varietyStr}

The user has ${currency_symbol}${balance} in floating cash available (after all budgets).
Budgets already set: ${budgets?.length ? budgets.map(b => b.name + ' (' + b.period + ')').join(', ') : 'none'}.

Suggest 6 real, current, FUN activities, venues, restaurants or experiences that genuinely exist near the user's exact location and fit their budget. Mix free and paid. If in Kenya, use real Kenyan place names.

Return a JSON object: { "results": [ ...6 items ] }. Each item has exactly:
- id (string like "act_1"), title, emoji, description (1-2 lively sentences, mention the real place name AND the city ${location?.city || ''}),
- estimated_cost (number in ${currency}), category (one of "food","outdoor","entertainment","social","relaxation","adventure"),
- why_now (short fun reason), is_free (boolean).`;
  }

  if (type === 'opportunities') {
    prompt = `You are a sharp income scout helping a tech-savvy person in Kenya find LESS OBVIOUS, higher-value online earning opportunities — the "hidden gems" most people don't know about.

The user currently has ${currency_symbol}${balance} available in ${currency}.${varietyStr}

Focus on lesser-known but legitimate platforms and gigs active in 2026, such as: smart-contract / security audit contests and bug bounties (e.g. Code4rena, Sherlock, Cantina, Immunefi, HackenProof), data-labelling and AI-training micro-tasks (e.g. Atlas/Capture-style annotation platforms, Outlier, DataAnnotation, Remotasks-style tools), crypto/web3 testnet incentives and quests, paid open-source bounties (e.g. Algora, Gitcoin), UX research panels, and niche freelance marketplaces. AVOID the generic obvious ones (basic surveys, Fiverr gig spam) unless framed in a clever, higher-earning way.

Do NOT state a single fixed exact price. Instead express realistic POTENTIAL earnings as a range, because actual pay depends on effort and skill.

Return a JSON object: { "results": [ ...6 items ] }. Each item has exactly:
- id (string like "opp_1"), title, emoji, platform, description (2-3 sentences explaining why it's a hidden opportunity and how to start),
- estimated_earnings (string POTENTIAL range like "KSh 5,000 - 80,000 per audit" or "Up to $500/mo"), estimated_amount (number, realistic middle potential estimate in ${currency}),
- time_required (string), difficulty (one of "Easy","Medium","Hard"), link_hint (the platform website/app name).`;
  }

  if (type === 'hackathons') {
    const locStr = location?.city ? `The user is based in ${location.city}.` : '';
    prompt = `You are a hackathon scout. ${locStr}${varietyStr}

List 6 realistic UPCOMING hackathons a developer could join in 2026, mostly the kind hosted on Devpost, plus a few major ones (ETHGlobal, MLH, Major League Hacking, company hackathons, African tech hackathons). Include a mix of online/global and (if location known) some accessible from the user's region.

Return a JSON object: { "results": [ ...6 items ] }. Each item has exactly:
- id (string like "hack_1"), name, organizer, emoji,
- prize_pool (string like "$50,000" or "KSh 1,000,000"), themes (short comma string),
- mode (one of "Online","Hybrid","In-person"), location (city/country or "Global"),
- deadline (a realistic future ISO date string YYYY-MM-DD within the next 4 months),
- url_hint (e.g. "devpost.com"), description (1-2 sentences).`;
  }

  if (type === 'tech_events') {
    const locStr = location?.city
      ? `The user is in ${location.city} (coordinates ${location.lat}, ${location.lng}). Suggest tech events, meetups, conferences and developer gatherings that realistically happen IN or near ${location.city}.`
      : `No location given — suggest notable global/online tech events and meetups.`;
    prompt = `You are a local tech-scene guide. ${locStr}${varietyStr}

List 6 realistic upcoming tech events (meetups, conferences, dev community gatherings, workshops, demo days) for 2026.

Return a JSON object: { "results": [ ...6 items ] }. Each item has exactly:
- id (string like "evt_1"), name, emoji, organizer,
- category (one of "Meetup","Conference","Workshop","Hackathon","Demo Day","Networking"),
- venue (real-sounding venue or "Online"), city (${location?.city || 'varies'}),
- date (realistic future ISO date YYYY-MM-DD within next 3 months),
- description (1-2 sentences), is_free (boolean).`;
  }

  if (type === 'startup_analysis') {
    if (!startup) return res.status(400).json({ error: 'Startup data required' });

    const stagesText = Object.entries(startup.stages || {})
      .map(([stageId, stageData]) => {
        if (!stageData || Object.keys(stageData).length === 0) return null;
        const fields = Object.entries(stageData).map(([k, v]) => `${k}: ${v}`).join('\n  ');
        return `${stageId}:\n  ${fields}`;
      })
      .filter(Boolean)
      .join('\n\n');

    prompt = `You are a startup advisor. Analyze this startup and provide strategic feedback.

Startup Name: ${startup.name}
${startup.accelerator ? `Accelerator: ${startup.accelerator}` : ''}

Journey Data:
${stagesText || '(Minimal data filled in)'}

Provide a comprehensive analysis. Return a JSON object with exactly these fields:
{
  "strengths": "2-3 compelling reasons why this startup could succeed. Focus on unique positioning, market opportunity, and execution capability.",
  "risks": "2-3 key challenges or red flags to watch out for. Be honest about market saturation, technical challenges, or business model concerns.",
  "competitors": [
    {
      "name": "A real competing app/product",
      "description": "What they do in 1-2 sentences",
      "your_edge": "Specific advantage this startup has over them (e.g. cheaper pricing, better UX, untapped market)"
    },
    ...3-4 competitors total
  ],
  "next_steps": "3-4 critical things to focus on next (specific, actionable, prioritized by impact)"
}

Be specific, data-driven where possible, and constructive. Don't be afraid to point out real issues.`;
  }

  if (type === 'beauty_analysis') {
    if (!image) return res.status(400).json({ error: 'Photo required for beauty analysis' });
    const selected = Array.isArray(areas) && areas.length ? areas : ['skin', 'teeth', 'hair'];
    const areaText = selected.join(', ');
    prompt = `You are a friendly, knowledgeable grooming and skincare coach. Look carefully at the selfie photo provided and give an honest, encouraging self-care assessment for these areas only: ${areaText}.

Base every observation on what you can actually SEE in the photo (skin texture/tone/shine, teeth visible in a smile, hairline/scalp/hair density). If an area is not clearly visible, say so in its observation and give general best-practice tips instead of guessing. Keep advice safe, realistic and drugstore-affordable. Never diagnose medical conditions — if something looks like it needs a doctor or dentist, gently suggest seeing one. Be warm and motivating, never harsh about appearance.

Return a JSON object with EXACTLY this shape (include ONLY the keys for the requested areas: ${areaText}, plus overall and score):
{
  "overall": "1-2 warm sentences summarizing how things look and the single most impactful habit to start.",
  "score": 0-100 integer self-care score based on what is visible,
  "skin": {
    "type": "one of: dry, oily, combination, normal, sensitive",
    "observation": "what you see (1-2 sentences)",
    "concerns": ["short concern", "..."],
    "routine": ["concrete step 1", "step 2", "step 3"],
    "products": ["specific affordable product type, e.g. 'jojoba or rosehip facial oil for dryness'", "..."]
  },
  "teeth": {
    "observation": "what you see about teeth/gums/smile (1-2 sentences)",
    "concerns": ["..."],
    "routine": ["concrete step 1", "step 2"],
    "products": ["e.g. 'soft-bristle brush', 'fluoride toothpaste', 'whitening strips if wanted'"]
  },
  "hair": {
    "observation": "what you see about hair/hairline/scalp/density (1-2 sentences)",
    "concerns": ["e.g. 'thinning at temples', 'dry ends'"],
    "routine": ["concrete step 1", "step 2", "step 3"],
    "products": ["e.g. 'rosemary or castor oil for scalp', 'sulfate-free shampoo', 'consider minoxidil for thinning — research first'"]
  }
}
Only include the skin, teeth, and/or hair keys that are in this list: ${areaText}.`;
  }

  const isVision = type === 'beauty_analysis';

  try {
    const userContent = isVision
      ? [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: image } },
        ]
      : prompt;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: isVision ? GROQ_VISION_MODEL : GROQ_MODEL,
        temperature: isVision ? 0.5 : 0.8,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You output only valid JSON. No markdown, no commentary.' },
          { role: 'user', content: userContent },
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

    // For analysis types, return the full object (not just results)
    if (type === 'startup_analysis' || type === 'beauty_analysis') {
      try {
        const obj = JSON.parse(rawText);
        return res.status(200).json({ analysis: obj });
      } catch {
        console.error('Failed to parse analysis:', rawText);
        return res.status(500).json({ error: 'Could not parse analysis response' });
      }
    }

    return res.status(200).json({ results: parsed });
  } catch (err) {
    console.error('AI route error:', err);
    return res.status(500).json({ error: err.message });
  }
}
