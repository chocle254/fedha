// Curated directory of well-established accelerators, programs, grants and founder communities, worldwide.
// Terms and intake dates change every cycle, so each entry links to the official site. The "Find open
// calls" button in the Startup Launchpad searches the web for what is open right now.
export const PROGRAM_TYPES = ['Accelerator', 'Incubator', 'Fellowship', 'Grant', 'Credits', 'Community'];
export const REGIONS = ['Global / Remote', 'Africa', 'Americas', 'Europe', 'Asia', 'Middle East'];

export const PROGRAMS = [
  // ── Global / remote ──
  { name: 'Y Combinator', type: 'Accelerator', region: 'Global / Remote', mode: 'In-person (SF)', funding: '$500k standard deal', equity: true, stage: 'Idea → Seed', solo: true, cycle: '4 batches a year', url: 'https://www.ycombinator.com/apply', note: 'The most influential accelerator. Solo founders are accepted; a working product and users help a lot.' },
  { name: 'YC Startup School', type: 'Community', region: 'Global / Remote', mode: 'Online', funding: 'Free', equity: false, stage: 'Idea', solo: true, cycle: 'Always open', url: 'https://www.startupschool.org', note: 'Free course plus co-founder matching. A good first step before applying anywhere.' },
  { name: 'Techstars', type: 'Accelerator', region: 'Global / Remote', mode: 'Many cities + remote', funding: 'Investment for equity', equity: true, stage: 'Pre-seed → Seed', solo: true, cycle: 'Programs open through the year', url: 'https://www.techstars.com/accelerators', note: 'Dozens of themed programs worldwide, several have run in or for Africa.' },
  { name: 'Antler', type: 'Accelerator', region: 'Global / Remote', mode: 'Residency (30+ cities incl. Nairobi & Lagos)', funding: 'Pre-seed investment', equity: true, stage: 'Pre-idea → Idea', solo: true, cycle: 'Rolling cohorts', url: 'https://www.antler.co/apply', note: 'You can join alone with no idea; they help you find a co-founder.' },
  { name: 'Entrepreneur First', type: 'Accelerator', region: 'Global / Remote', mode: 'In-person (London, Paris, Bangalore, SF)', funding: 'Stipend + pre-seed', equity: true, stage: 'Pre-idea', solo: true, cycle: 'Cohorts through the year', url: 'https://www.joinef.com', note: 'Built for strong individuals before they have a team or an idea.' },
  { name: '500 Global', type: 'Accelerator', region: 'Global / Remote', mode: 'Varies by program', funding: 'Investment for equity', equity: true, stage: 'Seed', solo: false, cycle: 'Program-based', url: 'https://500.co', note: 'Runs regional accelerators; best once you have traction.' },
  { name: 'Founder Institute', type: 'Accelerator', region: 'Global / Remote', mode: 'Online + 200 cities', funding: 'No cash; equity pool', equity: true, stage: 'Idea', solo: true, cycle: 'Chapters open regularly', url: 'https://fi.co', note: 'Structured pre-seed program with local mentors, including East African chapters.' },
  { name: 'Emergent Ventures', type: 'Grant', region: 'Global / Remote', mode: 'Online application', funding: 'Grants, often $1k–$50k', equity: false, stage: 'Any', solo: true, cycle: 'Rolling', url: 'https://www.mercatus.org/emergent-ventures', note: 'Fast, no-equity grants for ambitious individuals anywhere, with a strong Africa track record.' },
  { name: 'Microsoft for Startups', type: 'Credits', region: 'Global / Remote', mode: 'Online', funding: 'Azure + OpenAI credits', equity: false, stage: 'Idea → Seed', solo: true, cycle: 'Always open', url: 'https://www.microsoft.com/en-us/startups', note: 'Free cloud and AI credits. No funding round needed to join.' },
  { name: 'AWS Activate', type: 'Credits', region: 'Global / Remote', mode: 'Online', funding: 'AWS credits', equity: false, stage: 'Idea → Seed', solo: true, cycle: 'Always open', url: 'https://aws.amazon.com/activate/', note: 'Cloud credits and tech support.' },
  { name: 'Google for Startups Cloud Program', type: 'Credits', region: 'Global / Remote', mode: 'Online', funding: 'Google Cloud credits', equity: false, stage: 'Pre-seed → Seed', solo: true, cycle: 'Always open', url: 'https://cloud.google.com/startup', note: 'Cloud credits; bigger tiers once you raise.' },
  { name: 'Indie Hackers', type: 'Community', region: 'Global / Remote', mode: 'Online', funding: 'Free', equity: false, stage: 'Any', solo: true, cycle: 'Always open', url: 'https://www.indiehackers.com', note: 'Solo founders sharing revenue numbers and what worked. Great for bootstrapped ideas.' },
  { name: 'Product Hunt', type: 'Community', region: 'Global / Remote', mode: 'Online', funding: 'Free', equity: false, stage: 'MVP', solo: true, cycle: 'Launch any day', url: 'https://www.producthunt.com', note: 'Launch your MVP to early adopters.' },
  { name: 'Hacker News (Show HN)', type: 'Community', region: 'Global / Remote', mode: 'Online', funding: 'Free', equity: false, stage: 'MVP', solo: true, cycle: 'Always open', url: 'https://news.ycombinator.com/show', note: 'Honest technical feedback from builders.' },
  { name: 'Hult Prize', type: 'Grant', region: 'Global / Remote', mode: 'Campus rounds → global finals', funding: '$1M prize', equity: false, stage: 'Idea', solo: false, cycle: 'Yearly, via universities', url: 'https://www.hultprize.org', note: 'Social-impact startup competition for university students.' },

  // ── Africa ──
  { name: 'Google for Startups Accelerator: Africa', type: 'Accelerator', region: 'Africa', mode: 'Hybrid', funding: 'Equity-free, credits + mentoring', equity: false, stage: 'Seed → Series A', solo: true, cycle: 'Yearly cohort', url: 'https://startup.google.com/programs/accelerator/africa/', note: 'Equity-free; for startups with a live product and traction.' },
  { name: 'Tony Elumelu Foundation Programme', type: 'Grant', region: 'Africa', mode: 'Online training', funding: '$5,000 seed capital, no equity', equity: false, stage: 'Idea → Early', solo: true, cycle: 'Applications open once a year', url: 'https://www.tonyelumelufoundation.org', note: 'One of the best entry points for African founders: training plus a non-refundable grant.' },
  { name: 'Founders Factory Africa', type: 'Accelerator', region: 'Africa', mode: 'Hybrid', funding: 'Investment + support', equity: true, stage: 'Pre-seed → Seed', solo: false, cycle: 'Sector-based cohorts', url: 'https://www.foundersfactory.africa', note: 'Fintech, health and climate tracks, often with corporate partners.' },
  { name: 'MEST Africa', type: 'Incubator', region: 'Africa', mode: 'In-person (Accra) + programs', funding: 'Training + seed investment', equity: true, stage: 'Idea', solo: false, cycle: 'Yearly intake', url: 'https://meltwater.org', note: 'Full-time training program that funds the best teams.' },
  { name: 'Catalyst Fund', type: 'Accelerator', region: 'Africa', mode: 'Remote + Nairobi', funding: 'Grant-style capital + support', equity: false, stage: 'Pre-seed', solo: true, cycle: 'Cohort-based', url: 'https://catalyst-fund.org', note: 'Inclusive fintech and climate resilience for underserved people.' },
  { name: 'Flat6Labs', type: 'Accelerator', region: 'Africa', mode: 'Regional programs', funding: 'Seed investment', equity: true, stage: 'Pre-seed → Seed', solo: false, cycle: 'Program-based', url: 'https://flat6labs.com', note: 'Active across North Africa and the Middle East, and expanding into more African countries.' },
  { name: 'Africa Prize for Engineering Innovation', type: 'Grant', region: 'Africa', mode: 'Hybrid', funding: 'Training + cash prizes', equity: false, stage: 'Prototype', solo: true, cycle: 'Yearly', url: 'https://raeng.org.uk/africa-prize', note: 'For engineering-based products built in Africa, software included.' },
  { name: 'iHub', type: 'Community', region: 'Africa', mode: 'Nairobi', funding: 'Community + programs', equity: false, stage: 'Any', solo: true, cycle: 'Events through the year', url: 'https://ihub.co.ke', note: "Nairobi's best-known tech hub: meetups, programs and other builders." },
  { name: 'Nailab', type: 'Incubator', region: 'Africa', mode: 'Nairobi', funding: 'Incubation programs', equity: false, stage: 'Idea → Early', solo: true, cycle: 'Program-based', url: 'https://nailab.co.ke', note: 'Nairobi incubator running sector programs with partners.' },
  { name: 'Seedstars', type: 'Accelerator', region: 'Africa', mode: 'Emerging markets, hybrid', funding: 'Investment + programs', equity: true, stage: 'Seed', solo: false, cycle: 'Program-based', url: 'https://www.seedstars.com', note: 'Emerging-markets focus with many African programs.' },

  // ── Europe ──
  { name: 'Station F Founders Program', type: 'Incubator', region: 'Europe', mode: 'In-person (Paris)', funding: 'Campus + perks, no equity', equity: false, stage: 'Early', solo: true, cycle: 'Twice a year', url: 'https://stationf.co', note: "The world's largest startup campus, with a separate Fighters Program for under-represented founders." },
  { name: 'Startup Wise Guys', type: 'Accelerator', region: 'Europe', mode: 'Hybrid (Tallinn & more)', funding: 'Investment for equity', equity: true, stage: 'Pre-seed', solo: false, cycle: 'Several programs a year', url: 'https://startupwiseguys.com', note: 'B2B SaaS and fintech tracks; remote-friendly.' },
  { name: 'Seedcamp', type: 'Accelerator', region: 'Europe', mode: 'London', funding: 'Pre-seed investment', equity: true, stage: 'Pre-seed', solo: true, cycle: 'Rolling', url: 'https://seedcamp.com', note: "Europe's best-known seed fund, with a strong founder network." },

  // ── Americas ──
  { name: 'a16z speedrun', type: 'Accelerator', region: 'Americas', mode: 'In-person (SF)', funding: 'Up to ~$1M', equity: true, stage: 'Pre-seed', solo: true, cycle: 'Cohorts', url: 'https://speedrun.a16z.com', note: 'Fast program from Andreessen Horowitz focused on games, consumer and AI.' },
  { name: 'South Park Commons', type: 'Community', region: 'Americas', mode: 'SF, NYC, Bangalore', funding: 'Founder Fellowship investment', equity: true, stage: 'Pre-idea', solo: true, cycle: 'Rolling', url: 'https://www.southparkcommons.com', note: 'A community for builders exploring before they commit to an idea.' },
  { name: 'Alchemist Accelerator', type: 'Accelerator', region: 'Americas', mode: 'Hybrid', funding: 'Investment for equity', equity: true, stage: 'Seed', solo: false, cycle: 'Twice a year', url: 'https://www.alchemistaccelerator.com', note: 'For founders selling to businesses (B2B / enterprise).' },
  { name: 'Plug and Play', type: 'Accelerator', region: 'Americas', mode: 'Global hubs', funding: 'Corporate partnerships, no fee', equity: false, stage: 'Seed → Series A', solo: false, cycle: 'Industry programs', url: 'https://www.plugandplaytechcenter.com', note: 'Connects startups with big corporate customers; Africa programs too.' },

  // ── Asia / Middle East ──
  { name: 'Hub71', type: 'Incubator', region: 'Middle East', mode: 'In-person (Abu Dhabi)', funding: 'Housing, office and license subsidies', equity: false, stage: 'Seed → Growth', solo: false, cycle: 'Cohorts', url: 'https://www.hub71.com', note: "Abu Dhabi's tech ecosystem with big incentives to relocate." },
  { name: 'Startup Chile', type: 'Accelerator', region: 'Americas', mode: 'In-person (Chile)', funding: 'Equity-free grant', equity: false, stage: 'Idea → Early', solo: true, cycle: 'Calls through the year', url: 'https://startupchile.org', note: 'Government-backed, equity-free, and open to foreign founders.' },
  { name: 'Surge (Peak XV)', type: 'Accelerator', region: 'Asia', mode: 'India & Southeast Asia', funding: 'Up to ~$3M', equity: true, stage: 'Seed', solo: false, cycle: 'Cohorts', url: 'https://www.surgeahead.com', note: "Peak XV's early-stage program for India and Southeast Asia." },
];

// Sort helpers for the directory.
export const SORTS = {
  fit: { label: 'Best fit for you', fn: (a, b) => score(b) - score(a) || a.name.localeCompare(b.name) },
  region: { label: 'Region', fn: (a, b) => REGIONS.indexOf(a.region) - REGIONS.indexOf(b.region) || a.name.localeCompare(b.name) },
  type: { label: 'Type', fn: (a, b) => PROGRAM_TYPES.indexOf(a.type) - PROGRAM_TYPES.indexOf(b.type) || a.name.localeCompare(b.name) },
  name: { label: 'A → Z', fn: (a, b) => a.name.localeCompare(b.name) },
};

// "Fit" for a solo technical founder in Kenya: solo-friendly, no equity, Africa or remote, early stage.
export function score(p) {
  let s = 0;
  if (p.solo) s += 3;
  if (!p.equity) s += 2;
  if (p.region === 'Africa') s += 3;
  if (p.region === 'Global / Remote') s += 2;
  if (/Online|Remote|Nairobi|Hybrid/i.test(p.mode)) s += 2;
  if (/Idea|Pre-idea|Any/.test(p.stage)) s += 2;
  return s;
}
