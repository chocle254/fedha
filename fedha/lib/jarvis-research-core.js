// Shared by pages/api/jarvis-research.js (direct calls) and pages/api/
// jarvis.js (when Jarvis calls research_online_opportunities/
// research_activities_nearby as a tool) — kept in one place so the two
// call sites can't drift into different prompts or weather logic.
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
  } else if (researchType === 'food_nearby') {
    const weather = location?.lat != null ? await getWeather(location.lat, location.lng) : null;
    const weatherDesc = weather ? describeWeatherCode(weather.weather_code) + ', ' + Math.round(weather.temperature_2m) + '°C, wind ' + Math.round(weather.wind_speed_10m) + ' km/h' : 'unknown';
    const now = new Date();
    const hour = now.getHours();
    const mealPeriod = hour < 11 ? 'breakfast' : hour < 16 ? 'lunch' : hour < 21 ? 'dinner' : 'late-night food';
    const area = location?.area || location?.city || "the user's area";
    const cityStr = location?.city || area;

    // Search broadly enough to surface ordinary local food joints, not only
    // polished hotels/restaurants that SEO directories tend to rank first.
    // The search engine may still return only well-indexed businesses, so
    // the prompt explicitly asks NIM to preserve genuine local results.
    searchQueries = [
      `local food joints cafes restaurants ${area} ${cityStr} Kenya`,
      `cheap affordable food places ${area} ${cityStr} Kenya`,
      `popular local eateries nyama choma kibanda hotel food ${area} ${cityStr} Kenya`,
      `${mealPeriod} food local restaurants cafes ${area} ${cityStr} Kenya`,
      `food places near ${area} market shopping centre stage ${cityStr} Kenya`,
      `"Dansed" ${cityStr} food restaurant cafe`,
      `"Karikoo" ${cityStr} food restaurant cafe`,
    ];

    writeupPrompt = (foundText) => `Below are real web search results for food and leisure around ${area} in ${cityStr}. Current local time is ${now.toLocaleString()}, relevant food period is ${mealPeriod}, weather is ${weatherDesc}.

The user does NOT want only fancy/upmarket restaurants. Treat "food options" broadly: include ordinary local eateries, affordable hotels, cafes, nyama choma spots, kibandas, food joints, takeaways, market/shopping-centre food spots, and casual places when they are actually named in the results. A simple local food place can be just as useful as a formal restaurant.

Extract ONLY specific venues that are actually named in the results. Do not rank them by prestige or price unless the source explicitly provides that information. Return VALID JSON ONLY with this exact shape:
{"summary":"short useful summary","places":[{"id":"short-id","name":"exact venue name","type":"restaurant|cafe|hotel|local_eatery|leisure","food":"specific food/dining info if actually stated, otherwise empty string","price":"price only if actually stated, otherwise empty string","hours":"hours only if actually stated, otherwise empty string","distance":"distance only if actually stated, otherwise empty string","area":"location only if actually stated, otherwise empty string"}]}

Include at most 8 places. Aim for a MIX of ordinary local places and formal restaurants when the results support both. Do not discard a local/affordable place merely because it has less online information. Prefer options relevant to ${mealPeriod}. A hotel is valid only if the results mention dining/food. Never invent a venue, price, hour, distance, food item or address. If a search result mentions a venue but does not provide food details, keep the venue and leave "food" empty. If the search results contain no specific named venues, return {"summary":"No specific nearby venues were found in the current search results.","places":[]}.

--- SEARCH RESULTS ---
${foundText}`;
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

  let content;
  let places = [];
  try {
    content = await nvidiaChat({ prompt: writeupPrompt(foundText), temperature: 0.2, maxTokens: 1100 });
    if (researchType === 'food_nearby') {
      try {
        const cleaned = content.replace(/^\`\`\`json\\s*/i, '').replace(/\\s*\`\`\`$/i, '').trim();
        const parsed = JSON.parse(cleaned);
        places = Array.isArray(parsed.places) ? parsed.places : [];
        content = parsed.summary || 'Nearby options found.';
      } catch {
        places = [];
      }
    }
  } catch (e) {
    const overloaded = e.status === 429 || e.status === 503 || /overloaded/i.test(e.message || '');
    const err = new Error(
      overloaded
        ? "NVIDIA's free AI tier is overloaded right now — this is on their end, not the app. Try again in a minute."
        : e.message
    );
    err.status = e.status;
    throw err;
  }

  return { content, citations, ...(researchType === 'food_nearby' ? { places } : {}) };
}

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
