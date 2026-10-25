import { requireUser } from '../../lib/require-user';
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
import { pickQueries, opportunitiesPrompt, BLOCKED } from '../../lib/opportunities';
import { PLAYBOOK, PITCH_SLIDES, INVESTORS, JUDGE_CRITERIA, playbookText } from '../../lib/founder-playbook';
import { STAGES } from '../../lib/startup';

// Muse's roadmap, pitch and readiness answers can take a while to write.
export const config = { maxDuration: 60 };

const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'; // free & strong; or 'llama-3.1-8b-instant' for speed
const SEARCH_GROUNDED_TYPES = new Set(['activities']);

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (req.body?.type === 'opportunities') return findOpportunities(req.body, res);

  const { type, balance, currency, location, dateMode, budgets, currency_symbol, nonce, startup, lesson, transcript, stage, question, history, stageId, start_date, hours_per_day, pitch, investor, transcript_turns, end_meeting } = req.body;
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

  // Muse on the startup page (see lib/founder-playbook.js).
  if (MUSE_TYPES.has(type)) {
    if (!startup) return res.status(400).json({ error: 'Startup data required' });
    if (type === 'startup_chat' && !String(question || '').trim()) return res.status(400).json({ error: 'Question required' });
    prompt = musePrompt(type, { startup, stageId, question, history, start_date, hours_per_day, pitch, investor, transcript_turns, end_meeting });
  }

  try {
    if (useSearch) {
      // activities/opportunities: run real web searches first, then have
      // NVIDIA NIM write up JSON from only what those searches found.
      const searchQueries = [
        location?.city ? `fun things to do in ${location.city}` : 'fun affordable activities',
        location?.city ? `restaurants activities near ${location.city}` : 'free activities near me',
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
        rawText = await nvidiaChat({ prompt: prompt(foundText), temperature: 0.5, maxTokens: 2500 });
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
      temperature: type === 'lesson_notes' ? 0.3 : MUSE_TYPES.has(type) ? 0.6 : 0.8,
      max_tokens: type === 'lesson_notes' ? 3000 : MUSE_TYPES.has(type) ? 6000 : 2000,
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

    if (MUSE_TYPES.has(type)) {
      const out = museResult(type, parseObject(rawText), { start_date, transcript_turns, end_meeting });
      if (out.error) return res.status(500).json(out);
      return res.status(200).json(out);
    }

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
  const clean = String(rawText || '').replace(/^\uFEFF/, '').trim();
  const candidates = [clean];
  const unfenced = clean
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
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

const MUSE_TYPES = new Set(['startup_chat', 'startup_roadmap', 'pitch_draft', 'pitch_judge', 'investor_turn', 'readiness_audit']);
const FOUNDER = 'The founder is a student developer in Kenya with little money: prefer free, scrappy, do-it-this-week actions, local channels (WhatsApp, campus, chamas, M-Pesa) and honest advice.';
const clip = (v, n) => String(v || '').slice(0, n);

// Everything the founder has written about the startup, for Muse's prompts.
function startupContext(startup, stageId) {
  const stagesText = Object.entries(startup.stages || {})
    .map(([id, data]) => {
      const lines = Object.entries(data || {}).filter(([, v]) => String(v || '').trim()).map(([k, v]) => `  ${k}: ${clip(v, 400)}`);
      return lines.length ? `${id}:\n${lines.join('\n')}` : null;
    })
    .filter(Boolean).join('\n');
  const log = (startup.log || []).slice(0, 6).map((l) => `  ${l.date}: ${clip(l.text, 200)}`).join('\n');
  const notes = (startup.notebook || []).slice(0, 8).map((n) => `  [${n.date} · ${n.kind || 'note'}] ${clip(n.title, 80)}: ${clip(n.body, 400)}`).join('\n');
  const gates = startup.gates || {};
  const stage = STAGES.find((s) => s.id === stageId);
  const gateLines = stage && PLAYBOOK[stage.id] ? PLAYBOOK[stage.id].gate.map((g, i) => `  [${gates[stage.id]?.[i] ? 'x' : ' '}] ${g}`).join('\n') : '';
  const pmf = startup.pmf || {};
  const pmfTotal = Number(pmf.very || 0) + Number(pmf.somewhat || 0) + Number(pmf.not || 0);
  const roadmap = startup.roadmap?.tasks?.length ? startup.roadmap.tasks.map((t) => `  [${t.done ? 'x' : ' '}] ${t.date || ''} ${clip(t.title, 100)}`).join('\n') : '';
  return [
    `Startup: ${startup.name}`,
    startup.accelerator ? `Accelerator: ${startup.accelerator}` : '',
    startup.mission ? `Mission: ${startup.mission}` : '',
    stage ? `Current stage: ${stage.label} — ${stage.blurb}` : '',
    startup.focus && !startup.focus.done ? `This week's commitment: ${startup.focus.text} (due ${startup.focus.due})` : '',
    `What they have written so far:\n${stagesText || '  (nothing yet)'}`,
    gateLines ? `Stage readiness checklist (x = done):\n${gateLines}` : '',
    roadmap ? `Current roadmap:\n${roadmap}` : '',
    pmfTotal ? `PMF survey: ${pmf.very || 0} very / ${pmf.somewhat || 0} somewhat / ${pmf.not || 0} not disappointed (${Math.round((Number(pmf.very || 0) / pmfTotal) * 100)}% very).` : '',
    pmf.ret1 || pmf.ret4 || pmf.ret8 ? `Retention: week1 ${pmf.ret1 || '?'}%, week4 ${pmf.ret4 || '?'}%, week8 ${pmf.ret8 || '?'}%` : '',
    startup.pitch?.one_liner ? `Pitch one-liner: ${clip(startup.pitch.one_liner, 200)}` : '',
    log ? `Recent progress:\n${log}` : '',
    notes ? `Founder's notebook (interviews, meetings, ideas):\n${notes}` : '',
  ].filter(Boolean).join('\n');
}

function musePrompt(type, b) {
  const st = STAGES.find((s) => s.id === b.stageId) || STAGES[0];
  const ctx = startupContext(b.startup, st.id);
  const book = playbookText(st.id);

  if (type === 'startup_chat') {
    const past = (Array.isArray(b.history) ? b.history : []).slice(-8).map((m) => `${m.role === 'user' ? 'Founder' : 'Muse'}: ${clip(m.text, 600)}`).join('\n');
    return `You are Muse, an experienced startup coach and co-founder who knows this startup well. You coach using the founder playbook below (it is built on YC Startup School, Paul Graham, The Mom Test, Lean Startup and similar guides).

${ctx}

Playbook for the ${st.label} stage:
${book}

${FOUNDER}

${past ? `Conversation so far:\n${past}\n\n` : ''}Founder: ${clip(b.question, 1200)}

Reply as Muse: specific to THIS startup and stage, practical and honest — say so if they are skipping a step or fooling themselves. Plain text, no markdown headings, at most 160 words. If you give steps, give at most 4 short lines starting with "• ". If a well-known framework fits (e.g. The Mom Test, Bullseye, Sean Ellis 40% test), name it.
Return JSON: {"reply":"..."}`;
  }

  if (type === 'startup_roadmap') {
    const p = PLAYBOOK[st.id];
    const hours = Math.min(6, Math.max(0.5, Number(b.hours_per_day) || 2));
    return `You are Muse, a startup coach. Turn the ${st.label} stage into a dated roadmap the founder can follow day by day. It will be added to their daily planner.

${ctx}

Playbook for ${st.label}:
${book}

${FOUNDER}
The founder can give about ${hours} hour(s) a day to the startup. The stage should take about ${p?.days || 14} days.

Return JSON: {"tasks":[{"day":0,"title":"...","how":["...","..."],"minutes":60,"time":null}]}
Rules:
- 6 to 12 tasks covering the playbook steps in order, SPECIFIC to this startup (name the users, channels, features). Skip steps the founder has clearly already done.
- "day" = days after the start (0 = today), spread across about ${p?.days || 14} days, at most 2 tasks on one day, and each day's minutes must fit in ${Math.round(hours * 60)} minutes.
- "how": 3 to 5 concrete sub-steps — what exactly to do, say, write or build, including example wording for messages or interview questions where useful.
- "minutes": realistic time, 20 to ${Math.round(hours * 60)}.
- "time": "HH:MM" (24h) ONLY for things that happen at a set time with other people (interviews, pitch meetings, launch posts); otherwise null. Use evenings (18:00-20:00) or weekend mornings for those.`;
  }

  if (type === 'pitch_draft') {
    return `You are a pitch coach who has prepared founders for YC and African accelerator demo days. Draft this startup's pitch.

${ctx}

Return JSON: {"one_liner":"...","elevator":"...","slides":{${PITCH_SLIDES.map((s) => `"${s.key}":"..."`).join(',')}}}
Rules:
- one_liner: under 15 words, "X helps Y do Z" style, no buzzwords.
- elevator: a 30-second spoken pitch (about 75 words) in first person.
- Each slide: 2 to 4 short lines separated by "\\n", plain words, what to SAY/SHOW. Slide guidance: ${PITCH_SLIDES.map((s) => `${s.title}: ${s.hint}`).join(' | ')}
- Use ONLY facts from the founder's data. Never invent numbers, users or team members. Where something is missing, write "[ADD: what is needed]" so the founder knows what to find out.`;
  }

  if (type === 'pitch_judge') {
    const pt = b.pitch || {};
    const slides = PITCH_SLIDES.map((s) => `${s.title}: ${clip(pt.slides?.[s.key], 600) || '(empty)'}`).join('\n');
    return `You are the judging panel at a startup demo day (think YC Demo Day, Africa's Business Heroes, a hackathon final). You are fair but strict; most early pitches score 40-65. Judge this pitch.

Background the panel can see:
${ctx}

THE PITCH
One-liner: ${clip(pt.one_liner, 300) || '(empty)'}
Elevator pitch: ${clip(pt.elevator, 1200) || '(empty)'}
${slides}

Return JSON: {"overall":0,"verdict":"...","scores":[{"criterion":"...","score":0,"note":"..."}],"strengths":["..."],"fixes":["..."],"questions":["..."]}
- scores: one per criterion, exactly these: ${JUDGE_CRITERIA.join(', ')}. score 1-10, note = one sentence why.
- overall 0-100, consistent with the scores. verdict = one sentence a judge would say.
- strengths: 2-3. fixes: the 3 changes that would raise the score most, most important first, concrete ("Replace X with Y").
- questions: 3 hard questions judges would ask after this pitch.
- Penalise invented-sounding claims, missing traction, vague markets and "[ADD:" gaps.`;
  }

  if (type === 'investor_turn') {
    const inv = INVESTORS.find((i) => i.id === b.investor) || INVESTORS[0];
    const turns = (Array.isArray(b.transcript_turns) ? b.transcript_turns : []).slice(-16);
    const answered = turns.filter((t) => t.role === 'founder').length;
    const final = b.end_meeting || answered >= 6;
    const convo = turns.map((t) => `${t.role === 'founder' ? 'Founder' : inv.name}: ${clip(t.text, 800)}`).join('\n');
    return `You are role-playing ${inv.name}, ${inv.role}. ${inv.style}
You are in a pitch meeting with this startup's founder. Stay in character; be realistic — real investors probe weak spots and do not hand out money easily.

What you know about the startup (from their deck and data room):
${ctx}

${convo ? `Meeting so far:\n${convo}\n` : 'The meeting is just starting.'}

${final
  ? `The meeting is over. Give your decision as this investor would, honestly, based on the answers given.
Return JSON: {"message":"your closing words to the founder (2-3 sentences)","done":true,"verdict":{"decision":"invest|maybe|pass","score":0,"amount":"what you'd offer and on what terms, or 'none'","reasons":["..."],"concerns":["..."],"to_change_mind":["..."]}}
score 0-100 = how investable this is to you right now.`
  : `${convo ? 'React to the founder\'s last answer in one short sentence (push back if it was vague), then ask your next question.' : 'Greet the founder briefly in character and ask your first question.'} Ask ONE question at a time, the one you most need answered next (problem, market, traction, why them, business model, competition, use of funds). Keep it under 60 words.
Return JSON: {"message":"...","done":false}`}`;
  }

  // readiness_audit
  return `You are an investor-readiness and product-market-fit assessor (think YC partner office hours). Assess honestly where this startup really is — do not flatter.

${ctx}

Stage checklists completed:
${STAGES.filter((s) => PLAYBOOK[s.id]).map((s) => `${s.label}: ${(b.startup.gates?.[s.id] || []).filter(Boolean).length}/${PLAYBOOK[s.id].gate.length}`).join(', ')}

Return JSON: {"score":0,"level":"...","summary":"...","dimensions":[{"name":"...","score":0,"evidence":"...","gap":"..."}],"next_tests":[{"test":"...","how":"...","success":"..."}]}
- dimensions, exactly these 8: Problem, Solution, Demand evidence, Retention, Willingness to pay, Distribution, Team, Investor readiness. score 0-10 each; evidence = what the data shows (or "No evidence yet"); gap = what is missing.
- score 0-100 overall market-fit readiness. level: one of "Idea only", "Early signals", "Getting close", "Strong fit".
- summary: 2 sentences, honest.
- next_tests: the 3 cheapest experiments that would most raise the score, each with how to run it this week and the number that means success.`;
}

function museResult(type, obj, b) {
  if (!obj) return { error: 'Muse could not answer right now — try again' };
  if (type === 'startup_chat') {
    const reply = String(obj.reply || '').trim();
    return reply ? { reply } : { error: 'Muse had nothing to say — try again' };
  }
  if (type === 'startup_roadmap') {
    const start = /^\d{4}-\d{2}-\d{2}$/.test(b.start_date || '') ? b.start_date : new Date().toISOString().slice(0, 10);
    const tasks = (obj.tasks || []).filter((t) => t && t.title).slice(0, 14).map((t) => {
      const d = new Date(start + 'T12:00:00');
      d.setDate(d.getDate() + Math.max(0, Math.min(60, Math.round(Number(t.day) || 0))));
      const time = /^\d{2}:\d{2}$/.test(String(t.time || '')) ? t.time : null;
      return {
        title: clip(t.title, 140),
        how: (Array.isArray(t.how) ? t.how : [t.how]).filter(Boolean).slice(0, 6).map((h) => clip(h, 300)),
        minutes: Math.max(15, Math.min(360, Math.round(Number(t.minutes) || 60))),
        date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        time,
      };
    }).sort((x, y) => (x.date + (x.time || '')).localeCompare(y.date + (y.time || '')));
    return tasks.length ? { tasks } : { error: 'Could not make a roadmap right now' };
  }
  if (type === 'pitch_draft') {
    const slides = {};
    PITCH_SLIDES.forEach((s) => { slides[s.key] = clip(obj.slides?.[s.key], 1200); });
    return { one_liner: clip(obj.one_liner, 200), elevator: clip(obj.elevator, 1500), slides };
  }
  if (type === 'pitch_judge') {
    const scores = (obj.scores || []).filter((x) => x && x.criterion).slice(0, 10).map((x) => ({ criterion: clip(x.criterion, 60), score: Math.max(0, Math.min(10, Number(x.score) || 0)), note: clip(x.note, 300) }));
    if (!scores.length) return { error: 'The judges could not score this pitch — try again' };
    const list = (v, n) => (Array.isArray(v) ? v : []).slice(0, n).map((x) => clip(x, 300));
    return { overall: Math.max(0, Math.min(100, Math.round(Number(obj.overall) || 0))), verdict: clip(obj.verdict, 300), scores, strengths: list(obj.strengths, 4), fixes: list(obj.fixes, 4), questions: list(obj.questions, 4) };
  }
  if (type === 'investor_turn') {
    const message = clip(obj.message, 1200).trim();
    if (!message) return { error: 'The investor went quiet — try again' };
    const v = obj.verdict;
    if (obj.done && v) {
      const list = (x) => (Array.isArray(x) ? x : []).slice(0, 4).map((y) => clip(y, 300));
      const decision = ['invest', 'maybe', 'pass'].includes(v.decision) ? v.decision : 'maybe';
      return { message, done: true, verdict: { decision, score: Math.max(0, Math.min(100, Math.round(Number(v.score) || 0))), amount: clip(v.amount, 200), reasons: list(v.reasons), concerns: list(v.concerns), to_change_mind: list(v.to_change_mind) } };
    }
    return { message, done: false };
  }
  // readiness_audit
  const dims = (obj.dimensions || []).filter((x) => x && x.name).slice(0, 8).map((x) => ({ name: clip(x.name, 40), score: Math.max(0, Math.min(10, Number(x.score) || 0)), evidence: clip(x.evidence, 300), gap: clip(x.gap, 300) }));
  if (!dims.length) return { error: 'Could not assess readiness right now' };
  return {
    score: Math.max(0, Math.min(100, Math.round(Number(obj.score) || 0))),
    level: clip(obj.level, 40), summary: clip(obj.summary, 500), dimensions: dims,
    next_tests: (obj.next_tests || []).slice(0, 3).map((t) => ({ test: clip(t?.test, 200), how: clip(t?.how, 400), success: clip(t?.success, 200) })),
  };
}

function parseObject(rawText) {
  const clean = String(rawText || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try { return JSON.parse(clean); } catch {}
  const start = clean.indexOf('{');
  if (start === -1) return null;
  const end = findBalancedJsonEnd(clean, start);
  if (end === -1) return null;
  try { return JSON.parse(clean.slice(start, end + 1)); } catch { return null; }
}

// ─── Earn Online ─────────────────────────────────────────────────────────────
// Search, then write cards. Everything has to finish inside Vercel's 60s
// limit, otherwise the page gets a timeout page instead of results, so each
// step has its own time cap: Groq (fast) writes first, NVIDIA is the backup.
const OPP_BUDGET_MS = 52000;

async function groqJson(prompt, { maxTokens, timeoutMs }) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.6,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      ...(GROQ_MODEL.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
      messages: [
        { role: 'system', content: 'You output only valid JSON. No markdown, no commentary.' },
        { role: 'user', content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data.error?.message || 'Groq API error');
    err.status = response.status;
    throw err;
  }
  return data.choices?.[0]?.message?.content || '';
}

function isBlockedOpportunity(r) {
  const hay = `${r.platform || ''} ${r.title || ''} ${r.site_url || ''}`.toLowerCase();
  return BLOCKED.some((b) => hay.includes(b.toLowerCase().replace(/\.com$/, '')));
}

async function findOpportunities(body, res) {
  const started = Date.now();
  const left = () => OPP_BUDGET_MS - (Date.now() - started);
  const exclude = Array.isArray(body.exclude) ? body.exclude.slice(0, 40).map((x) => String(x).slice(0, 60)) : [];

  let foundText;
  try {
    ({ text: foundText } = await webSearchMulti(pickQueries(), { limitEach: 5, timeoutMs: 12000, snippetChars: 220 }));
  } catch (e) {
    console.error('[fedha] Earn Online search failed:', e.status, e.message);
    return res.status(500).json({ error: "Couldn't reach search results right now. Try again in a moment." });
  }

  const prompt = opportunitiesPrompt({
    foundText,
    currency: body.currency || 'KES',
    currencySymbol: body.currency_symbol || 'KSh',
    balance: Math.max(0, Number(body.balance) || 0),
    exclude,
  });

  let results = null;
  let lastErr = null;
  if (process.env.GROQ_API_KEY) {
    try {
      results = parseResultsJson(await groqJson(prompt, { maxTokens: 3000, timeoutMs: Math.min(26000, left() - 2000) }));
    } catch (e) {
      lastErr = e;
      console.warn('[fedha] Earn Online: Groq failed, trying NVIDIA:', e.status, e.message);
    }
  }
  if ((!results || !results.length) && process.env.NVIDIA_API_KEY && left() > 8000) {
    try {
      results = parseResultsJson(await nvidiaChat({ prompt, temperature: 0.5, maxTokens: 3000, timeoutMs: left() - 1500, maxAttempts: 2 }));
    } catch (e) {
      lastErr = e;
      console.error('[fedha] Earn Online: NVIDIA failed:', e.status, e.message);
    }
  }

  if (!results) {
    const busy = lastErr && [413, 429, 503, 504].includes(lastErr.status);
    return res.status(500).json({
      error: busy
        ? 'The free AI services are busy right now. Give it a minute and try again.'
        : !process.env.GROQ_API_KEY && !process.env.NVIDIA_API_KEY
          ? 'No AI key is set (GROQ_API_KEY or NVIDIA_API_KEY).'
          : "Couldn't write up the results this time. Try again.",
    });
  }

  // Safety net on top of the prompt: no blocked names, one card per platform.
  const seen = new Set();
  const clean = results.filter((r) => {
    if (!r || !r.title || isBlockedOpportunity(r)) return false;
    const key = String(r.platform || r.title).toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((r, i) => ({ ...r, id: `opp_${Date.now().toString(36)}_${i}` }));

  return res.status(200).json({
    results: clean,
    ...(clean.length ? {} : { note: 'Nothing solid enough turned up this time. Tap again for a different search.' }),
  });
}
