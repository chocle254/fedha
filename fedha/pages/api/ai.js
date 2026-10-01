// pages/api/ai.js — uses Groq (free, generous, OpenAI-compatible) for most
// types. Set GROQ_API_KEY.
//
// `activities` and `opportunities` are the exception: they used to run on
// groq/compound (Groq's agentic model with a built-in web_search tool) so
// results were grounded in something real instead of the model imagining
// plausible-sounding place/platform names from memory. That model's
// free-tier limits kept returning 413s independent of how big our own
// prompt was (see git history / community.groq.com/t/1322), and neither
// the app's rest of Groq traffic (plain GROQ_MODEL, used below for
// hackathons/tech_events/startup_analysis) nor Jarvis's main chat loop was
// ever the thing failing — so only these two types have moved off Groq
// entirely. Real retrieval now comes from lib/web-search.js (Firecrawl's
// keyless search API — no signup, no API key required to get started, see
// docs.firecrawl.dev/features/search — separate service and separate
// limits from Groq entirely), and lib/nvidia-client.js (NVIDIA NIM's free
// Nemotron model) writes up the JSON from those real results — it never
// invents an item that isn't grounded in something Firecrawl actually found.
import { webSearchMulti } from '../../lib/web-search';
import { nvidiaChat } from '../../lib/nvidia-client';

const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'; // free & strong; or 'llama-3.1-8b-instant' for speed
const SEARCH_GROUNDED_TYPES = new Set(['activities', 'opportunities']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, balance, currency, location, dateMode, budgets, currency_symbol, nonce, startup, lesson, transcript } = req.body;
  const useSearch = SEARCH_GROUNDED_TYPES.has(type);

  if (type === 'lesson_notes' && !transcript?.trim()) return res.status(400).json({ error: 'Lesson transcript is required' });

  if (!useSearch) {
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set in environment variables' });
  }

  let prompt = '';

  const varietyStr = nonce ? `\nFreshness token: ${nonce}. Give a DIFFERENT, fresh set of ideas than you might usually pick — avoid repeating the obvious defaults.` : '';

  if (type === 'lesson_notes') {
    prompt = `You are Fedha's study-notes assistant. Turn the supplied lesson transcript into accurate, useful study notes.

Course: ${lesson?.course || 'Unknown course'}
Section: ${lesson?.section || 'Course content'}
Lesson: ${lesson?.title || 'Lesson'}
Provider: ${lesson?.provider || 'Unknown'}

Rules:
- Use ONLY information contained in the transcript. Do not invent facts.
- Make the notes easy to revise later.
- Start with a short lesson summary.
- Extract the most important concepts and explain them clearly.
- Include important terms/definitions when the transcript provides them.
- Include practical examples mentioned in the transcript.
- End with 3-5 short knowledge-check questions. Do not include answers unless the transcript explicitly gives them.
- Keep the output concise enough to review, but do not omit important ideas.
- Use clean Markdown headings and bullets.

TRANSCRIPT:
${transcript}`;

  }

  if (type === 'activities') {
    const locationStr = location?.city
      ? `The user is physically located in/near ${location.city} (GPS coordinates: ${location.lat}, ${location.lng}). EVERY single suggestion MUST be a real place, venue, event or experience that actually appears in the search results below and is IN or very close to ${location.city} — within roughly 15km. Do NOT suggest places in other cities or other countries, and do not invent a venue that isn't in the results.`
      : `No location provided — suggest general affordable activities from the search results below.`;
    const modeStr = dateMode
      ? `This is for a romantic date — pick couple-friendly, fun, memorable, exciting date activities from the results. Make them feel special and worth doing.`
      : `This is for personal enjoyment — pick genuinely FUN, exciting solo or social activities from the results the user will actually be excited to do. Avoid boring or generic picks like "go for a walk" unless paired with something specific and fun.`;
    prompt = (foundText) => `You are a fun, energetic local guide helping someone enjoy their money wisely.

${locationStr}
${modeStr}${varietyStr}

The user has ${currency_symbol}${balance} in floating cash available (after all budgets).
Budgets already set: ${budgets?.length ? budgets.map(b => b.name + ' (' + b.period + ')').join(', ') : 'none'}.

Below are real, current web search results. Using ONLY places/venues/experiences that actually appear in these results — never invent a name not present below — pick 6 that genuinely exist near the user's location right now and fit their budget. Mix free and paid.

--- SEARCH RESULTS ---
${foundText}

Return ONLY a JSON object (no markdown, no commentary): { "results": [ ...6 items ] }. Each item has exactly:
- id (string like "act_1"), title, emoji, description (1-2 lively sentences, mention the real place name AND the city ${location?.city || ''}),
- estimated_cost (number in ${currency}), category (one of "food","outdoor","entertainment","social","relaxation","adventure"),
- why_now (short fun reason), is_free (boolean).
If fewer than 6 results genuinely fit, return fewer items rather than padding with invented ones.`;
  }

  if (type === 'opportunities') {
    prompt = (foundText) => `You are Fedha's online-income discovery researcher for a tech-savvy user in Kenya.

The goal is NOT to repeatedly recommend the same famous platforms. Search broadly and surface legitimate, less-obvious, higher-ceiling opportunities where access is gated by assessments, credentials, screening, invitations, language/region requirements, portfolio review, or demonstrated expertise.

The user currently has ${currency_symbol}${balance} available in ${currency}.${varietyStr}

IMPORTANT DISCOVERY RULES:
1. Use ONLY platforms that appear in the supplied search evidence. Never invent a platform, URL, rating, earnings figure, review count, or eligibility claim.
2. Strongly prefer diversity. In one result set, do not repeat the same platform or near-identical platform category. Try to mix at least 4 categories when evidence allows: AI expert/evaluation work, expert networks/research panels, security/bug bounties, developer/open-source bounties, UX/user research, language/audio evaluation, specialist freelance/talent networks, and niche marketplaces.
3. Prefer GATE-KEPT opportunities. Explicitly identify the gate: assessment, interview, credentials, portfolio, invite, qualification test, geographic eligibility, or specialist expertise.
4. Search community discussions such as Reddit for worker experiences, hidden platforms, actual payout reports and availability. Community posts are supporting evidence only; distinguish them from official claims and do not treat anecdotes as guaranteed facts.
5. Prefer the official platform domain for site_url. site_verified=true means the official domain was identified in the evidence; it does NOT mean Fedha guarantees legitimacy, earnings, availability, or payment.
6. Ratings must be sourced. If no defensible current rating is found, use null.
7. Earnings are POTENTIAL, not guaranteed. Prefer hourly/project rates from evidence, then calculate a transparent daily/weekly potential using realistic hours. Do not present advertised maximums as expected income.
8. Account for Kenya/region eligibility where evidence exists. If country availability is unclear, say "Check Kenya eligibility".
9. Avoid repeatedly returning DataAnnotation, Outlier, CrowdGen, TELUS, etc. unless the current evidence specifically makes them unusually relevant. Variety is a core requirement.
10. Never recommend a platform merely because an SEO article calls it "best". Look for primary-source evidence and/or multiple independent community reports.

--- SEARCH RESULTS ---
${foundText}

Return ONLY a JSON object (no markdown, no commentary): { "results": [ ...6 items ] }. Each item must contain exactly:
- id, title, emoji, platform,
- category (one of "AI Expert Work","Research Panel","Bug Bounty","Developer Bounty","UX Research","Language/Audio","Specialist Network","Niche Freelance","Other"),
- description (2-3 sentences explaining the actual work and how to start),
- gate (the main acceptance barrier),
- site_url (full official website URL from evidence),
- site_verified (boolean),
- site_verification_note (brief evidence-based note; never say "guaranteed legit"),
- community_evidence (short summary of what workers/community discussions report, if available; otherwise "No strong community evidence found"),
- estimated_daily_earnings (potential range in ${currency}),
- estimated_weekly_earnings (potential range in ${currency}),
- estimated_amount (number, conservative middle potential estimate in ${currency}, for the existing tracker),
- working_hours (realistic range),
- rating (number or null),
- rating_count (number or null),
- difficulty (one of "Easy","Medium","Hard"),
- time_required (concise time/commitment summary).
If fewer than 6 opportunities meet the evidence requirements, return fewer. Never pad with invented results.`;
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

  try {
    if (useSearch) {
      // activities/opportunities: run real web searches first, then have
      // NVIDIA NIM write up JSON from only what those searches found.
      const searchQueries = type === 'activities'
        ? [
            location?.city ? `fun things to do in ${location.city}` : 'fun affordable activities',
            location?.city ? `restaurants activities near ${location.city}` : 'free activities near me',
          ]
        : [
            'gated high paying remote AI expert evaluation platforms official site 2026 Mercor Alignerr Surge Mindrift specialist',
            'hidden invite screening online work expert networks research panels paid studies platform official site 2026',
            'bug bounty paid security research platforms official site 2026 HackerOne Bugcrowd YesWeHack Intigriti',
            'paid open source coding bounties developer bounty platforms official site 2026 Algora Gitcoin',
            'remote AI training data annotation platforms Africa Kenya screening qualification 2026 official',
            'community discussion lesser known high paying online work platforms 2026 Reddit WorkOnline AI training annotation',
          ];

      let foundText;
      try {
        ({ text: foundText } = await webSearchMulti(searchQueries));
      } catch (e) {
        console.error('[fedha] Firecrawl search failed for', type, ':', e.status, e.message);
        return res.status(500).json({
          error: "Couldn't reach real search results right now — try again in a moment.",
          ...(process.env.NODE_ENV !== 'production' ? { debug: e.message, debugStatus: e.status } : {}),
        });
      }

      let rawText;
      try {
        rawText = await nvidiaChat({ prompt: prompt(foundText), temperature: 0.5, maxTokens: type === 'opportunities' ? 4000 : 2500 });
      } catch (e) {
        console.error('[fedha] NVIDIA NIM failed for', type, ':', e.status, e.message);
        // NVIDIA's own staff confirm the free tier can genuinely run out of
        // capacity under load (distinct from a bug in this app) — say so
        // plainly after nvidiaChat's built-in retries are exhausted, rather
        // than a generic "something went wrong".
        const overloaded = e.status === 429 || e.status === 503 || /overloaded/i.test(e.message || '');
        return res.status(500).json({
          error: overloaded
            ? "NVIDIA's free AI tier is overloaded right now — this is on their end, not the app. Try again in a minute."
            : "Couldn't generate suggestions right now — try again in a moment.",
          ...(process.env.NODE_ENV !== 'production' ? { debug: e.message, debugStatus: e.status } : {}),
        });
      }

      if (!rawText) return res.status(500).json({ error: 'Empty response from NVIDIA NIM' });

      const parsed = parseResultsJson(rawText);
      if (parsed === null) return res.status(500).json({ error: 'Could not parse AI response', raw: rawText });
      return res.status(200).json({ results: parsed });
    }

    // Every other type: unchanged, plain Groq chat model.
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    const body = {
      model: GROQ_MODEL,
      temperature: type === 'lesson_notes' ? 0.3 : 0.8,
      max_tokens: type === 'lesson_notes' ? 3000 : 2000,
      ...(type === 'lesson_notes' ? {} : { response_format: { type: 'json_object' } }),
      messages: [
        { role: 'system', content: type === 'lesson_notes' ? 'Produce accurate study notes in clean Markdown. Do not add information that is not in the transcript.' : 'You output only valid JSON. No markdown, no commentary.' },
        { role: 'user', content: prompt },
      ],
    };

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      console.error(`[fedha] groq/${GROQ_MODEL} request failed:`, response.status, JSON.stringify(data.error || data));
      return res.status(500).json({ error: data.error?.message || 'Groq API error' });
    }

    const rawText = data.choices?.[0]?.message?.content || '';
    if (!rawText) return res.status(500).json({ error: 'Empty response from Groq' });

    if (type === 'lesson_notes') return res.status(200).json({ notes: rawText.trim() });

    // For analysis types, return the full object (not just results)
    if (type === 'startup_analysis') {
      try {
        const obj = JSON.parse(rawText);
        return res.status(200).json({ analysis: obj });
      } catch {
        console.error('Failed to parse analysis:', rawText);
        return res.status(500).json({ error: 'Could not parse analysis response' });
      }
    }

    const parsed = parseResultsJson(rawText);
    if (parsed === null) return res.status(500).json({ error: 'Could not parse AI response', raw: rawText });
    return res.status(200).json({ results: parsed });
  } catch (err) {
    console.error('AI route error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// Shared JSON-parsing fallback: the plain Groq model reliably returns
// strict JSON (response_format: json_object), but NVIDIA NIM has no
// equivalent strict mode, so its output may wrap the JSON in ```json
// fences or add a sentence of narration around it. Strip fences first,
// then try an object match (the prompts ask for {"results":[...]}) before
// falling back to a bare array match. Returns null if nothing parseable
// was found.
function parseResultsJson(rawText) {
  const clean = String(rawText || '').replace(/^\\uFEFF/, '').trim();
  const candidates = [clean];
  const unfenced = clean
    .replace(/^\\s*\`\`\`(?:json)?\\s*/i, '')
    .replace(/\\s*\`\`\`\\s*$/i, '')
    .trim();
  if (unfenced !== clean) candidates.push(unfenced);

  for (const candidate of candidates) {
    try {
      const obj = JSON.parse(candidate);
      return Array.isArray(obj) ? obj : obj?.results || obj?.items || obj?.data || [];
    } catch {}
  }

  for (const candidate of candidates) {
    for (let start = 0; start < candidate.length; start++) {
      if (candidate[start] !== '{' && candidate[start] !== '[') continue;
      const end = findBalancedJsonEnd(candidate, start);
      if (end === -1) continue;
      try {
        const obj = JSON.parse(candidate.slice(start, end + 1));
        return Array.isArray(obj) ? obj : obj?.results || obj?.items || obj?.data || [];
      } catch {}
    }
  }
  return null;
}

function findBalancedJsonEnd(text, start) {
  const stack = [];
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') {
      const expected = ch === '}' ? '{' : '[';
      if (stack[stack.length - 1] !== expected) return -1;
      stack.pop();
      if (stack.length === 0) return i;
    }
  }
  return -1;
}
