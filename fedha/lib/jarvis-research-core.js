// Shared by pages/api/jarvis-research.js (direct calls) and pages/api/
// jarvis.js (when Jarvis calls research_online_opportunities/
// research_activities_nearby as a tool) — kept in one place so the two
// call sites can't drift into different prompts or weather logic.

const COMPOUND_MODEL = 'groq/compound';

async function getWeather(lat, lng) {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,precipitation,weather_code,wind_speed_10m&timezone=auto`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.current || null;
  } catch {
    return null;
  }
}

function describeWeatherCode(code) {
  if (code === 0) return 'clear sky';
  if ([1, 2, 3].includes(code)) return 'partly cloudy';
  if ([45, 48].includes(code)) return 'foggy';
  if ([51, 53, 55, 56, 57].includes(code)) return 'drizzling';
  if ([61, 63, 65, 66, 67].includes(code)) return 'raining';
  if ([71, 73, 75, 77].includes(code)) return 'snowing';
  if ([80, 81, 82].includes(code)) return 'rain showers';
  if ([95, 96, 99].includes(code)) return 'thunderstorm';
  return 'unknown conditions';
}

// groq/compound is allowed up to 10 internal web_search calls per request
// (see console.groq.com/docs/compound/systems) before it produces a final
// answer, and everything each of those searches turns up gets folded back
// into the model's own context to write that answer. Prompts like the
// "online_opportunities" one below, which name several specific platforms
// and ask the model to verify each one, reliably push it into doing enough
// of those searches that the accumulated context trips Groq's request-size
// ceiling — which comes back as a plain 413 "Request Entity Too Large",
// not a helpful "you did too many searches" message. That's what was
// silently failing the research_online_opportunities tool call in
// pages/api/jarvis.js (leaving the model nothing to work with on its
// second pass, hence the empty/fallback reply) and what pages/discover.js
// was surfacing verbatim as a red error banner.
// groq/compound-mini caps itself at exactly 1 tool call, which keeps the
// accumulated context small enough to stay under that ceiling — at some
// cost to how many sources get cross-checked. So: try the full model
// first for the richer result, and only fall back to mini on the specific
// failure this causes, rather than giving up entirely.
async function callCompound(apiKey, prompt, model) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'Groq-Model-Version': 'latest',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      compound_custom: { tools: { enabled_tools: ['web_search'] } },
      max_tokens: 900,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data.error?.message || 'Groq Compound API error');
    err.status = response.status;
    throw err;
  }
  return data;
}

export async function runResearch(researchType, location, freeMinutes, topic) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set in environment variables');

  let prompt;
  if (researchType === 'topic') {
    if (!topic || !topic.trim()) throw new Error('topic is required for researchType "topic"');
    prompt = `Search the web right now for real, current, specific information on the following topic: "${topic.trim()}". Only include things you actually found via search just now — real names, real URLs, real numbers — never invent anything. Be thorough but concise: cover the most important and most recent findings first. Format your answer as a short set of plain-language findings (a few sentences each), citing where each came from inline (site name). End with a one-paragraph overall summary of what this means for someone evaluating "${topic.trim()}".`;
  } else if (researchType === 'online_opportunities') {
    prompt = `Search the web right now for REAL, CURRENTLY ACTIVE online micro-task platforms, gig sites, bounty programs, or remote micro-jobs that a tech-savvy person could realistically start today. I specifically want lesser-known, hidden-gem opportunities — not just Fiverr/Upwork basics — things like data-labeling/AI-training task platforms, bug bounty or security-audit contest platforms, paid open-source bounty boards, UX research panels, or niche freelance boards. For each one you find, give me the ACTUAL website URL you found it at (not a guess), a one-sentence description of what it is, and a realistic sense of what it pays. Only include things you actually found via search just now — do not invent any platform or URL. List at most 6. Format your final answer as a numbered list: name — URL — one-sentence description — realistic pay range.`;
  } else {
    const weather = location?.lat != null ? await getWeather(location.lat, location.lng) : null;
    const weatherDesc = weather ? `${describeWeatherCode(weather.weather_code)}, ${Math.round(weather.temperature_2m)}°C, wind ${Math.round(weather.wind_speed_10m)} km/h` : 'unknown (no location provided)';
    const timeStr = new Date().toLocaleString();
    prompt = `Search the web right now for REAL activities, venues, or events happening in or very near ${location?.city || "the user's area"} that would be good to do RIGHT NOW, given: current time is ${timeStr}, current weather is ${weatherDesc}${freeMinutes ? `, and the person has about ${freeMinutes} minutes free` : ''}. Factor the weather in seriously — do not suggest an outdoor activity if it's raining or a bad time of day for it. Only include real, specific places or events you actually found via search — real names, not invented ones. If you find an event with a specific time/date, mention it. List at most 6. Format your final answer as a numbered list: name — one-sentence description — why it fits right now (weather/time reasoning) — rough cost if known.`;
  }

  // Each of these gets appended to a Research entry's `entries` array and
  // saved as one JSON blob (see saveResearchForm in pages/tech-hub.js).
  // Without a cap on the completion itself, a handful of searches on a rich
  // topic could grow that blob large enough to trip a payload-size limit on
  // save (a second, separate place "entity too large" could show up) — the
  // max_tokens: 900 above keeps each individual finding bounded so
  // accumulating several of them stays well under that.
  let data;
  try {
    data = await callCompound(GROQ_API_KEY, prompt, COMPOUND_MODEL);
  } catch (e) {
    if (e.status === 413) {
      data = await callCompound(GROQ_API_KEY, prompt, 'groq/compound-mini');
    } else {
      throw e;
    }
  }

  const content = data.choices?.[0]?.message?.content || '';

  let citations = [];
  try {
    const tools = data.choices?.[0]?.message?.executed_tools || [];
    for (const t of tools) {
      const results = t.search_results?.results || t.search_results || [];
      for (const r of Array.isArray(results) ? results : []) {
        if (r?.url) citations.push(r.url);
      }
    }
  } catch (e) {
    console.warn('[fedha] citation extraction failed (non-fatal):', e.message);
  }

  return { content, citations: [...new Set(citations)] };
}

// Called when the user is done digging into a research entry — takes
// everything gathered across one or more runResearch('topic', ...) calls
// (each appended as the user researched further) and condenses it into one
// closing summary for the entry, rather than leaving them with a pile of
// raw search dumps to re-read later.
export async function summarizeResearchWindow(entryTitle, accumulatedFindings) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set in environment variables');
  if (!accumulatedFindings || !accumulatedFindings.trim()) throw new Error('accumulatedFindings is required');

  const prompt = `You're wrapping up a research session titled "${entryTitle}". Below is everything gathered across the session (possibly several separate search passes). Write ONE tight closing summary: the key facts/findings that actually matter, any conclusion or recommendation that follows from them, and anything still unresolved worth following up on later. Do not re-run searches or invent anything not already present below — just distill it.\n\n--- RAW FINDINGS ---\n${accumulatedFindings}`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      temperature: 0.4,
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Groq API error');
  return data.choices?.[0]?.message?.content || '';
}
