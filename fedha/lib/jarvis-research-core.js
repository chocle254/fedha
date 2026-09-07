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

export async function runResearch(researchType, location, freeMinutes) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set in environment variables');

  let prompt;
  if (researchType === 'online_opportunities') {
    prompt = `Search the web right now for REAL, CURRENTLY ACTIVE online micro-task platforms, gig sites, bounty programs, or remote micro-jobs that a tech-savvy person could realistically start today. I specifically want lesser-known, hidden-gem opportunities — not just Fiverr/Upwork basics — things like data-labeling/AI-training task platforms, bug bounty or security-audit contest platforms, paid open-source bounty boards, UX research panels, or niche freelance boards. For each one you find, give me the ACTUAL website URL you found it at (not a guess), a one-sentence description of what it is, and a realistic sense of what it pays. Only include things you actually found via search just now — do not invent any platform or URL. List at most 6. Format your final answer as a numbered list: name — URL — one-sentence description — realistic pay range.`;
  } else {
    const weather = location?.lat != null ? await getWeather(location.lat, location.lng) : null;
    const weatherDesc = weather ? `${describeWeatherCode(weather.weather_code)}, ${Math.round(weather.temperature_2m)}°C, wind ${Math.round(weather.wind_speed_10m)} km/h` : 'unknown (no location provided)';
    const timeStr = new Date().toLocaleString();
    prompt = `Search the web right now for REAL activities, venues, or events happening in or very near ${location?.city || "the user's area"} that would be good to do RIGHT NOW, given: current time is ${timeStr}, current weather is ${weatherDesc}${freeMinutes ? `, and the person has about ${freeMinutes} minutes free` : ''}. Factor the weather in seriously — do not suggest an outdoor activity if it's raining or a bad time of day for it. Only include real, specific places or events you actually found via search — real names, not invented ones. If you find an event with a specific time/date, mention it. List at most 6. Format your final answer as a numbered list: name — one-sentence description — why it fits right now (weather/time reasoning) — rough cost if known.`;
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Groq-Model-Version': 'latest',
    },
    body: JSON.stringify({
      model: COMPOUND_MODEL,
      messages: [{ role: 'user', content: prompt }],
      compound_custom: { tools: { enabled_tools: ['web_search'] } },
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Groq Compound API error');

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
