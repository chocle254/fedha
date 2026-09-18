// lib/web-search.js — real web search via Firecrawl's search endpoint, used
// to replace groq/compound's built-in web_search tool for the two features
// that need actually-current, actually-real results (Jarvis's research
// tools, and Discover's Suggest Activities / Find Online Opportunities).
// NVIDIA NIM (lib/nvidia-client.js) has no built-in search of its own, so
// this runs first and its results get folded into the prompt NIM sees —
// NIM only ever synthesizes/summarizes real snippets, never invents them.
//
// Uses Firecrawl's "Keyless" tier: docs.firecrawl.dev/features/search
// confirms every code sample works with NO Authorization header and NO
// signup — 1,000 free credits/month automatically, no account needed to
// get started. If FIRECRAWL_API_KEY is set (optional — sign up at
// firecrawl.dev for a key), it's sent for higher rate limits/credits, but
// it is never required.

export async function webSearch(query, { limit = 8 } = {}) {
  const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY; // optional

  const response = await fetch('https://api.firecrawl.dev/v2/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(FIRECRAWL_API_KEY ? { Authorization: `Bearer ${FIRECRAWL_API_KEY}` } : {}),
    },
    body: JSON.stringify({ query, limit }),
  });

  const data = await response.json();
  if (!response.ok || data.success === false) {
    console.error('[fedha] Firecrawl search request failed:', response.status, JSON.stringify(data));
    const err = new Error(data.error || data.message || 'Firecrawl search API error');
    err.status = response.status;
    throw err;
  }

  const results = (data.data?.web || []).map((r) => ({
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
export async function webSearchMulti(queries, { limitEach = 6 } = {}) {
  const settled = await Promise.allSettled(queries.map((q) => webSearch(q, { limit: limitEach })));

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
