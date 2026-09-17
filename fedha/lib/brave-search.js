// lib/brave-search.js — real web search via the Brave Search API, used to
// replace groq/compound's built-in web_search tool for the two features
// that need actually-current, actually-real results (Jarvis's research
// tools, and Discover's Suggest Activities / Find Online Opportunities).
// NVIDIA NIM (lib/nvidia-client.js) has no built-in search of its own, so
// this runs first and its results get folded into the prompt NIM sees —
// NIM only ever synthesizes/summarizes real snippets, never invents them.
//
// Get a free API key at api.search.brave.com (free tier: 2,000 queries／
// month, 1 req/sec). Set BRAVE_SEARCH_API_KEY in your environment.

export async function braveSearch(query, { count = 8 } = {}) {
  const BRAVE_SEARCH_API_KEY = process.env.BRAVE_SEARCH_API_KEY;
  if (!BRAVE_SEARCH_API_KEY) throw new Error('BRAVE_SEARCH_API_KEY not set in environment variables');

  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': BRAVE_SEARCH_API_KEY,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    console.error('[fedha] Brave Search request failed:', response.status, JSON.stringify(data));
    const err = new Error(data.error?.message || data.message || 'Brave Search API error');
    err.status = response.status;
    throw err;
  }

  const results = (data.web?.results || []).map((r) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.description || '',
  }));

  return results;
}

// Runs several searches (one per query) and folds them into one plain-text
// block a chat model can read as its "search results", roughly mirroring
// what groq/compound used to hand back internally. Queries are run in
// parallel and a failure on any one of them is dropped rather than failing
// the whole batch, since partial real results are still better than none.
export async function braveSearchMulti(queries, { countEach = 6 } = {}) {
  const settled = await Promise.allSettled(queries.map((q) => braveSearch(q, { count: countEach })));

  const blocks = [];
  const citations = [];
  settled.forEach((s, i) => {
    if (s.status !== 'fulfilled' || !s.value.length) return;
    const lines = s.value.map((r) => {
      citations.push(r.url);
      return `- ${r.title}: ${r.snippet} (${r.url})`;
    });
    blocks.push(`Search: "${queries[i]}"\n${lines.join('\n')}`);
  });

  if (!blocks.length) {
    const firstError = settled.find((s) => s.status === 'rejected');
    throw firstError?.reason || new Error('All searches returned no results');
  }

  return { text: blocks.join('\n\n'), citations: [...new Set(citations)] };
}
