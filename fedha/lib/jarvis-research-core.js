// Shared by pages/api/jarvis-research.js (direct calls) and pages/api/
// jarvis.js (when Jarvis calls research_online_opportunities/
// research_activities_nearby as a tool) — kept in one place so the two
// call sites can't drift into different prompts or weather logic.
//
// runResearch() used to call groq/compound, which does its own web search
// internally — but that model's free-tier limits kept returning 413s (see
// git history / community.groq.com/t/1322: Groq confirms free-tier 413s on
// compound models aren't only about request size, they can be a rate
// ceiling on the model itself). Since the rest of the app's chat traffic
// (Jarvis's main conversation loop, planner generation) is on Groq's plain
// openai/gpt-oss-120b and was never the thing failing, only this one
// search-grounded piece has moved: real retrieval now comes from
// lib/web-search.js (Firecrawl's keyless search API — no signup, no API
// key required to get started, see docs.firecrawl.dev/features/search —
// completely separate service and limits from Groq), and
// lib/nvidia-client.js (NVIDIA NIM's free Nemotron model) synthesizes an
// answer from those real results. NIM never searches on its own — it only
// ever writes from snippets Firecrawl actually found, same "don't invent
// it" discipline the old prompts asked of groq/compound.
import { webSearchMulti } from './web-search';
import { nvidiaChat } from './nvidia-client';

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

export async function runResearch(researchType, location, freeMinutes, topic) {
  // Each researchType maps to 1-3 real Firecrawl searches (the actual
  // retrieval step groq/compound used to do internally) plus the prompt
  // that asks NIM to write up ONLY what those searches actually found.
  let searchQueries;
  let writeupPrompt;

  if (researchType === 'topic') {
    if (!topic || !topic.trim()) throw new Error('topic is required for researchType "topic"');
    searchQueries = [topic.trim()];
    writeupPrompt = (foundText) => `Below are real, current web search results for the topic "${topic.trim()}". Using ONLY what's actually in these results — never invent a name, number, or URL not present below — write a short set of plain-language findings (a few sentences each), citing where each came from inline (site name). End with a one-paragraph overall summary of what this means for someone evaluating "${topic.trim()}". If the results below don't actually cover the topic well, say so plainly instead of filling gaps from your own general knowledge.\n\n--- SEARCH RESULTS ---\n${foundText}`;
  } else if (researchType === 'online_opportunities') {
    searchQueries = [
      'lesser known online micro task gig platforms 2026',
      'bug bounty security audit contest platforms currently active',
      'paid open source bounty boards UX research panels remote',
    ];
    writeupPrompt = (foundText) => `Below are real, current web search results about online micro-task platforms, gig sites, bounty programs, and remote micro-jobs. Using ONLY platforms that actually appear in these results — never invent a name or URL not present below — pick the most interesting lesser-known, hidden-gem opportunities (not just generic Fiverr/Upwork basics). For each one, give its real URL as it appears below, a one-sentence description, and a realistic sense of what it pays based on the snippet. List at most 6. Format your final answer as a numbered list: name — URL — one-sentence description — realistic pay range. If fewer than 6 genuinely fit, list fewer rather than padding with invented ones.\n\n--- SEARCH RESULTS ---\n${foundText}`;
  } else {
    const weather = location?.lat != null ? await getWeather(location.lat, location.lng) : null;
    const weatherDesc = weather ? `${describeWeatherCode(weather.weather_code)}, ${Math.round(weather.temperature_2m)}°C, wind ${Math.round(weather.wind_speed_10m)} km/h` : 'unknown (no location provided)';
    const timeStr = new Date().toLocaleString();
    const cityStr = location?.city || "the user's area";
    searchQueries = [
      `things to do in ${cityStr} today`,
      `events near ${cityStr} this week`,
    ];
    writeupPrompt = (foundText) => `Below are real, current web search results about activities, venues, or events in or near ${cityStr}. Current time is ${timeStr}, current weather is ${weatherDesc}${freeMinutes ? `, and the person has about ${freeMinutes} minutes free` : ''}. Using ONLY places/events that actually appear in the results below — never invent a name not present there — pick ones that make sense right now: factor the weather in seriously, don't suggest an outdoor activity if it's raining or a bad time of day for it. If you find a specific time/date in the results, mention it. List at most 6. Format your final answer as a numbered list: name — one-sentence description — why it fits right now (weather/time reasoning) — rough cost if known. If fewer than 6 genuinely fit, list fewer rather than padding with invented ones.\n\n--- SEARCH RESULTS ---\n${foundText}`;
  }

  const { text: foundText, citations } = await webSearchMulti(searchQueries);

  // Each of these gets appended to a Research entry's `entries` array and
  // saved as one JSON blob (see saveResearchForm in pages/tech-hub.js).
  // Capping the writeup keeps each individual finding bounded so
  // accumulating several of them across a session stays well under any
  // payload-size limit on save.
  let content;
  try {
    content = await nvidiaChat({ prompt: writeupPrompt(foundText), temperature: 0.5, maxTokens: 900 });
  } catch (e) {
    // nvidiaChat already retries transient errors internally — if it still
    // failed, NVIDIA's own staff confirm their free tier can genuinely run
    // out of capacity under load (forums.developer.nvidia.com/t/324036),
    // separate from anything wrong in this app. Say so plainly rather than
    // a generic message, since pages/api/jarvis-research.js and
    // pages/api/jarvis.js both pass err.message straight through to the UI.
    const overloaded = e.status === 429 || e.status === 503 || /overloaded/i.test(e.message || '');
    const err = new Error(
      overloaded
        ? "NVIDIA's free AI tier is overloaded right now — this is on their end, not the app. Try again in a minute."
        : e.message
    );
    err.status = e.status;
    throw err;
  }

  return { content, citations };
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
