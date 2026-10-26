// Discover → Earn Online: finds legit, less-obvious, good-paying ways to earn
// online for a user in Kenya. Real web search first (lib/web-search.js),
// then an AI writes cards using only what the search found.
//
// Every request draws a different mix of searches from POOL, so each tap
// surfaces new places instead of the same famous names.

// One search angle per lane; each request picks lanes at random.
export const POOL = {
  esports: [
    'online esports tournaments cash prize pool open registration 2026 Africa players',
    'paid esports tournaments EA FC Call of Duty Mobile PUBG Mobile cash prizes Kenya 2026',
    'start.gg Challengermode Battlefy cash prize online tournaments open to all regions',
  ],
  competitions: [
    'Zindi data science competitions cash prizes Africa 2026 open challenges',
    'Kaggle competitions prize money 2026 active',
    'Topcoder challenges prize payouts developers design 2026',
    'online skill competitions cash prizes writing design coding 2026 international entrants',
  ],
  audits: [
    'smart contract audit contests prize pools Code4rena Sherlock Cantina 2026',
    'Immunefi bug bounty payouts web3 researchers 2026',
    'bug bounty platforms researchers payouts Intigriti YesWeHack HackerOne Africa researchers',
  ],
  bounties: [
    'Superteam Earn bounties paid in USDC writing design development 2026',
    'Algora open source bounties paid GitHub issues 2026',
    'paid open source bounty programs developers 2026 hidden',
  ],
  expert: [
    'paid expert network consultations GLG Guidepoint AlphaSights become an expert hourly rate',
    'Respondent User Interviews paid research studies 100 per hour professionals',
    'paid medical legal finance expert calls online side income platforms',
  ],
  ai: [
    'invite only AI training expert platforms high hourly pay PhD coders 2026 Mercor Alignerr Mindrift',
    'Atlas style hidden AI tasking platforms high pay reddit 2026',
    'reddit hidden gem online work platforms actually paid good money 2026 not upwork fiverr',
  ],
  niche: [
    'paid technical writing programs developer articles pay per article 2026',
    'paid beta testing apps games platforms professional testers 2026 legit',
    'remote language audio evaluation specialist contracts Swahili 2026 paid',
  ],
};

// Mainstream or low-value places the user has asked us not to suggest, plus
// classic scam shapes.
export const BLOCKED = [
  'Fiverr', 'Upwork', 'Freelancer.com', 'PeoplePerHour', 'Guru', 'Toptal', 'Swagbucks', 'InboxDollars',
  'Survey Junkie', 'Toluna', 'YouGov', 'Clickworker', 'Amazon Mechanical Turk', 'Remotasks', 'DataAnnotation',
  'Outlier', 'TELUS', 'Appen', 'CrowdGen', 'Picoworkers', 'Microworkers',
];

function shuffle(a, rand) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

// Six searches: always esports + competitions (the user's favourites), then
// four other lanes at random, one random angle from each.
export function pickQueries(rand = Math.random) {
  const pick = (lane) => POOL[lane][Math.floor(rand() * POOL[lane].length)];
  const others = shuffle(Object.keys(POOL).filter((k) => k !== 'esports' && k !== 'competitions'), rand).slice(0, 4);
  return ['esports', 'competitions', ...others].map(pick);
}

export const CATEGORIES = [
  'Esports Tournament', 'Skill Competition', 'Audit Contest', 'Bug Bounty', 'Developer Bounty',
  'Crypto Bounty', 'Expert Calls', 'Paid Research', 'AI Expert Work', 'Niche Gig',
];

export function opportunitiesPrompt({ foundText, currency, currencySymbol, balance, exclude = [] }) {
  const skip = [...new Set([...BLOCKED, ...exclude])].filter(Boolean);
  return `You find hidden-gem ways to earn online for a skilled, tech-savvy person in Kenya.

WHAT THEY WANT
- Legit, good-paying, less-obvious opportunities: cash-prize esports tournaments, skill competitions (data science, coding, design), audit contests, bug and developer bounties, crypto bounties paid in stablecoins, paid expert calls, high-paying research studies, invite-only AI expert work, niche paid programs.
- NOT the obvious stuff. Never suggest: ${skip.join(', ')}. No generic freelancing marketplaces, survey apps, "watch ads", "click tasks", reselling or MLM.

LEGITIMACY RULES (strict)
1. Use ONLY platforms, tournaments or programs that appear in the search results below. Never invent a name, URL, prize, rate or rating.
2. Drop anything that asks the user to pay to join or deposit money, promises guaranteed returns, recruits via Telegram/WhatsApp "tasks", or has no official site in the results.
3. site_url must be the official domain when it appears in the results.
4. Prize pools and rates are POTENTIAL, never guaranteed. For tournaments and contests, say what the prize pool is and that only winners or top finishers get paid.
5. Say honestly whether people in Kenya can take part and how money arrives (PayPal, Payoneer, bank, crypto/USDC, M-Pesa…). If unclear: "Check Kenya eligibility".
6. Mix at least 4 different categories. Never two items from the same platform.
${varietyNote()}
The user has ${currencySymbol}${balance} spare (${currency}).

--- SEARCH RESULTS ---
${foundText}

Return ONLY JSON: { "results": [ up to 6 items ] }. Each item has exactly:
- id ("opp_1"…), title (short, specific), emoji, platform,
- category (one of ${CATEGORIES.map((c) => `"${c}"`).join(', ')}),
- description (2-3 sentences: what you actually do, and how to start this week),
- gate (what stands between the user and getting paid: skill test, ranking, portfolio, invite, KYC…),
- payout (how money arrives, from evidence, or "Check payout options"),
- kenya_ok ("Yes", "Check", or "No"),
- site_url, site_verified (boolean: official domain seen in results),
- site_verification_note (short, evidence-based; never "guaranteed legit"),
- community_evidence (what real participants report, or "No strong community evidence found"),
- estimated_daily_earnings and estimated_weekly_earnings (realistic potential ranges in ${currency}; for prize-based items describe the prize, e.g. "Top 3 share $5,000"),
- estimated_amount (number: a conservative ${currency} figure for one good week),
- working_hours, difficulty ("Easy" | "Medium" | "Hard"), time_required,
- rating (number or null), rating_count (number or null).
Fewer than 6 is fine. Never pad with invented items.`;
}

function varietyNote() { return `Freshness token: ${Date.now()}. Prefer surprising, lesser-known picks.\n`; }
