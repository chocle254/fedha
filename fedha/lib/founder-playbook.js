// The founder playbook: what to do at each startup stage, how to do it, how to
// know you're ready to move on, and what usually goes wrong. Distilled from
// well-known founder guides (YC Startup School, Paul Graham's essays, The Mom
// Test, The Lean Startup, Sequoia's pitch outline, Superhuman's PMF engine…),
// written for a student founder in Kenya with little money and lots of time.
//
// Muse (the startup page's AI) is given the current stage's entry, so its
// advice and schedules follow the same playbook you can read in the app.

export const PLAYBOOK = {
  ideation: {
    goal: 'Prove that a specific group of people has a painful problem they already try to solve.',
    days: 14,
    steps: [
      { title: 'Write the problem in one sentence', how: ['Name WHO has it (be specific: "boda boda riders in Eldoret", not "Kenyans").', 'Name WHAT hurts and how often it happens.', 'Read it to a friend — if they ask "so what?", sharpen it.'], minutes: 45 },
      { title: 'List 20 people who have this problem', how: ['Start with people you can reach this week: classmates, family, WhatsApp groups.', 'Write name + how you will reach them.', 'Aim for people who are NOT your friends too — friends are polite.'], minutes: 60 },
      { title: 'Run 5–10 problem interviews (The Mom Test)', how: ['Ask about their life, not your idea: "Tell me about the last time this happened."', 'Ask what they do about it today and what it costs them (time or money).', 'Never pitch. Never ask "would you use…?" — people lie to be nice.', 'Write notes in the Notebook straight after each call.'], minutes: 120 },
      { title: 'Map what people use today', how: ['List every current workaround: apps, spreadsheets, a cousin, doing nothing.', 'Note why each one falls short.', 'Your real competitor is often "doing nothing" — know why they tolerate it.'], minutes: 60 },
      { title: 'Score the pain', how: ['For each interview: did they already spend money/time trying to fix it?', 'Did they ask when they could try your solution?', 'Count how many said yes to both — that is your signal.'], minutes: 30 },
      { title: 'Write your one-line solution', how: ['"We help [who] [do what] by [how], unlike [current workaround]."', 'Put it as your North Star at the top of this page.'], minutes: 30 },
    ],
    gate: [
      'I talked to at least 5 people who have the problem (not friends being nice)',
      'At least 3 of them already spend time or money trying to fix it',
      'I can name what they use today and why it falls short',
      'I can say who it is for and what it does in one sentence',
    ],
    mistakes: [
      'Falling in love with the solution before confirming the problem.',
      'Asking "would you use this?" — compliments are not data.',
      'Picking a problem you have never seen anyone actually suffer from.',
    ],
    reads: [
      { title: 'How to Get Startup Ideas', author: 'Paul Graham', url: 'http://paulgraham.com/startupideas.html', idea: 'The best ideas come from noticing problems in your own life — "live in the future, then build what is missing".' },
      { title: 'The Mom Test', author: 'Rob Fitzpatrick', url: 'https://www.momtestbook.com/', idea: 'Talk about their life, not your idea. Ask about specifics in the past, not opinions about the future.' },
      { title: 'YC Startup School', author: 'Y Combinator', url: 'https://www.startupschool.org/', idea: 'Free course from YC — the ideas and "talking to users" lectures fit this stage.' },
    ],
  },

  prototyping: {
    goal: 'Build the cheapest thing that lets a real user feel the solution, and learn from watching them.',
    days: 14,
    steps: [
      { title: 'Pick the ONE core action', how: ['Write the single thing a user must be able to do for the idea to make sense.', 'Cut everything else: login, settings, dashboards can wait.'], minutes: 30 },
      { title: 'Sketch the flow on paper', how: ['Draw 3–5 screens from opening the app to the core action done.', 'Show it to 2 people and ask them to "tap" through with a finger.'], minutes: 45 },
      { title: 'Build a clickable or fake-backend prototype', how: ['Figma, a simple Next.js page, or even WhatsApp + a Google Form.', 'Fake what is hard (do it manually behind the scenes — "Wizard of Oz").', 'Time-box: 2–4 days, not weeks.'], minutes: 180 },
      { title: 'Test with 5 users', how: ['Give them a task, then stay quiet and watch.', 'Note where they hesitate, get lost, or say "oh nice".', 'Ask: "What did you expect to happen there?"'], minutes: 120 },
      { title: 'Write down what you learned', how: ['Top 3 confusions, top 3 moments of delight.', 'Decide: keep, change or drop each feature.', 'Log it in the Notebook as a "Test" note.'], minutes: 30 },
    ],
    gate: [
      'At least 5 people used the prototype while I watched',
      'Most of them completed the core action without my help',
      'I know the top 3 things to change before building for real',
      'I have chosen a simple tech stack I can ship with alone',
    ],
    mistakes: [
      'Polishing the design before anyone has used it.',
      'Building infrastructure (auth, admin panel) instead of the core action.',
      'Testing only with people who already like you.',
    ],
    reads: [
      { title: 'The Lean Startup', author: 'Eric Ries', url: 'http://theleanstartup.com/', idea: 'Build → measure → learn as fast as possible. A prototype is an experiment, not a product.' },
      { title: 'Do Things That Don’t Scale', author: 'Paul Graham', url: 'http://paulgraham.com/ds.html', idea: 'Do things by hand at first — it is how you learn what to automate.' },
    ],
  },

  mvp: {
    goal: 'Ship the smallest real product that delivers the core value to real users.',
    days: 21,
    steps: [
      { title: 'Write the MVP scope on one page', how: ['List must-haves (core action + the minimum to make it work).', 'List "later" items and park them.', 'If the list takes more than 3 weeks to build, cut again.'], minutes: 45 },
      { title: 'Build the core flow end-to-end', how: ['Get it working ugly first, then improve.', 'Deploy early (Vercel/Render free tiers) so you can share a link.', 'If money moves, use M-Pesa (Daraja API) or a simple paybill + manual check.'], minutes: 240 },
      { title: 'Add the one metric you will watch', how: ['Pick the action that means a user got value (e.g. "sent a payment", "logged a meal").', 'Track it in a simple table or analytics tool from day one.'], minutes: 60 },
      { title: 'Recruit your first 10 users by hand', how: ['Go back to the people you interviewed — they are your first users.', 'Onboard each one personally, sitting with them or on a call.'], minutes: 120 },
      { title: 'Fix what blocks them', how: ['Keep a list of every bug and complaint.', 'Fix blockers within 24 hours — speed of response is your advantage.'], minutes: 120 },
    ],
    gate: [
      'The product is live at a link real people can use',
      'At least 10 real users have tried it',
      'I track one number that shows people get value',
      'Nothing critical blocks a new user from getting to the core action',
    ],
    mistakes: [
      'Waiting until it is "ready" — you will never feel ready.',
      'Adding features instead of talking to the users you already have.',
      'Launching to strangers before your first 10 users are happy.',
    ],
    reads: [
      { title: 'How to Start a Startup', author: 'Paul Graham', url: 'http://paulgraham.com/start.html', idea: 'Make something people want, start small and launch fast.' },
      { title: 'Safaricom Daraja (M-Pesa API)', author: 'Safaricom', url: 'https://developer.safaricom.co.ke/', idea: 'Free sandbox for adding M-Pesa payments to your MVP.' },
    ],
  },

  pilot: {
    goal: 'Run the MVP with a small committed group for a fixed time and prove it works with numbers.',
    days: 21,
    steps: [
      { title: 'Define the pilot and its success number', how: ['Who: 5–20 users from one clear group (one school, one market, one SACCO).', 'How long: 2–4 weeks.', 'Success: one number decided BEFORE you start, e.g. "60% use it 3x a week".'], minutes: 45 },
      { title: 'Recruit and onboard the pilot group', how: ['Explain it is a pilot and you want honest feedback.', 'Onboard each person yourself and add them to a WhatsApp group for support.', 'Get a partner (a school, a chama, a shop) if it opens a door to many users.'], minutes: 120 },
      { title: 'Weekly check-ins', how: ['Every week: look at the usage numbers, then call 3 users.', 'Ask: "What did you use it for this week? What annoyed you?"', 'Write each check-in in the Notebook.'], minutes: 60 },
      { title: 'Fix fast, change one thing at a time', how: ['Ship small fixes during the pilot.', 'Do not change everything at once — you will not know what worked.'], minutes: 120 },
      { title: 'Write the pilot report', how: ['Did you hit the success number? Show the data.', 'Best 3 user quotes, top 3 problems.', 'Decision: launch, change, or rethink.'], minutes: 60 },
      { title: 'Turn pilot users into proof', how: ['Ask happy users for a testimonial or short video.', 'Ask a partner for a letter of support — useful for grants and investors.'], minutes: 45 },
    ],
    gate: [
      'I set a success number before the pilot started',
      'The pilot ran for at least 2 weeks with real users',
      'I have usage data, not just opinions',
      'I have written a pilot report with a clear launch/change/rethink decision',
    ],
    mistakes: [
      'Running a pilot with no success number — then everything looks like success.',
      'Letting the pilot drag on forever instead of deciding.',
      'Not talking to the pilot users who stopped using it — they teach you the most.',
    ],
    reads: [
      { title: 'The only thing that matters', author: 'Marc Andreessen', url: 'https://pmarchive.com/guide_to_startups_part4.html', idea: 'Market matters most — a pilot tells you if the market is pulling the product out of you.' },
    ],
  },

  launch: {
    goal: 'Go public on a set date and turn attention into your first wave of active users.',
    days: 14,
    steps: [
      { title: 'Set the launch date and message', how: ['Pick a date 1–2 weeks out and put it in the planner.', 'Message: who it is for + what it does for them, in plain words.', 'Prepare 3 screenshots or a 30-second screen recording.'], minutes: 60 },
      { title: 'Build the launch list', how: ['Every interviewee, pilot user and friend who offered to help.', 'WhatsApp groups, campus groups, LinkedIn, X, relevant Reddit/Discord communities.', 'Ask 5 people to share on the day.'], minutes: 60 },
      { title: 'Prepare the landing page', how: ['Headline = your message. One clear signup button.', 'Add pilot results and testimonials as proof.', 'Track signups so you know which channel worked.'], minutes: 120 },
      { title: 'Launch day', how: ['Post early in the day, in every channel on your list.', 'Reply to every comment and message personally.', 'Consider Product Hunt if your users are global and tech-savvy.'], minutes: 180 },
      { title: 'Follow up for 2 weeks', how: ['Welcome every signup personally.', 'Watch the activation number: how many signups do the core action?', 'Write what worked in the Notebook — it is your marketing plan.'], minutes: 60 },
    ],
    gate: [
      'The product is public and anyone can sign up',
      'I know which channel brought the most active users',
      'I track signups AND how many of them get value',
      'I have a list of what to fix from launch feedback',
    ],
    mistakes: [
      'Treating launch as one big day instead of the start of selling.',
      'Launching where it feels impressive instead of where users are.',
      'Counting signups instead of active users.',
    ],
    reads: [
      { title: 'Product Hunt launch guide', author: 'Product Hunt', url: 'https://www.producthunt.com/launch', idea: 'How to prepare a launch on Product Hunt, if your audience is there.' },
      { title: 'Traction (Bullseye framework)', author: 'Gabriel Weinberg & Justin Mares', url: 'https://www.tractionbook.com/', idea: 'Test several channels cheaply, then focus on the one that works.' },
    ],
  },

  pmf: {
    goal: 'Get to the point where a clear group of users would be very disappointed without your product.',
    days: 28,
    steps: [
      { title: 'Run the Sean Ellis survey', how: ['Ask active users: "How would you feel if you could no longer use this?"', 'Answers: Very disappointed / Somewhat / Not disappointed.', '40%+ "very disappointed" is the usual sign of product-market fit. Track it in Readiness.'], minutes: 60 },
      { title: 'Find your super-fans', how: ['Look at who answered "very disappointed".', 'What do they have in common? That is your real target user.', 'Ask them: "What is the main benefit you get?"'], minutes: 60 },
      { title: 'Measure retention', how: ['Of users who joined in a week, how many still use it 1, 4 and 8 weeks later?', 'A curve that flattens (stops dropping) means you have a core who stays.'], minutes: 60 },
      { title: 'Fix what holds back the "somewhat" group', how: ['Ask somewhat-disappointed users what would make it a must-have.', 'Build only what fans of the main benefit also want.'], minutes: 180 },
      { title: 'Re-survey every month', how: ['Track the % very disappointed over time.', 'Every product change should push this number up.'], minutes: 30 },
    ],
    gate: [
      '40% or more of active users would be "very disappointed" without it',
      'My retention curve flattens instead of dropping to zero',
      'Users come back without me reminding them',
      'Some new users arrive by word of mouth',
    ],
    mistakes: [
      'Scaling marketing before retention is fixed — it is pouring water into a leaking bucket.',
      'Listening to everyone equally instead of your super-fans.',
      'Confusing a launch spike with real demand.',
    ],
    reads: [
      { title: 'How Superhuman built an engine to find product-market fit', author: 'Rahul Vohra (First Round Review)', url: 'https://review.firstround.com/how-superhuman-built-an-engine-to-find-product-market-fit', idea: 'Use the 40% survey as a number you push up, segment by super-fans.' },
      { title: '16 Startup Metrics', author: 'a16z', url: 'https://a16z.com/16-startup-metrics/', idea: 'How investors read retention, growth and engagement numbers.' },
    ],
  },

  growth: {
    goal: 'Find one or two marketing channels that bring users reliably and grow week over week.',
    days: 28,
    steps: [
      { title: 'Set a weekly growth target', how: ['Pick the number (active users or revenue) and aim for 5–7% growth a week.', 'Review it every Monday in the planner.'], minutes: 30 },
      { title: 'Test 3 channels cheaply (Bullseye)', how: ['Brainstorm channels: content, referrals, partnerships, campus reps, ads, communities.', 'Run a small test of 3 for one week each with a tiny budget.', 'Measure cost and quality of users from each.'], minutes: 120 },
      { title: 'Double down on the winner', how: ['Put most of your time into the channel that worked.', 'Make a repeatable weekly routine for it.'], minutes: 120 },
      { title: 'Build a referral loop', how: ['Give happy users a reason and an easy way to invite friends.', 'Reward both sides if you can afford it (airtime, discount).'], minutes: 120 },
      { title: 'Hire or recruit for the bottleneck', how: ['What is slowing growth most? Sales? Support? Building?', 'Bring in help only for that — interns, co-founder, freelancer.'], minutes: 60 },
    ],
    gate: [
      'I grow my key number week over week, most weeks',
      'I know my cost to get one user (CAC)',
      'One channel brings users reliably without me pushing every day',
      'I have a referral or word-of-mouth loop',
    ],
    mistakes: [
      'Spreading thin across 10 channels.',
      'Spending on ads before knowing a user is worth more than they cost.',
      'Hiring before the bottleneck is clear.',
    ],
    reads: [
      { title: 'Startup = Growth', author: 'Paul Graham', url: 'http://paulgraham.com/growth.html', idea: 'A startup is a company designed to grow fast; pick a weekly growth rate and hit it.' },
      { title: 'Traction (Bullseye framework)', author: 'Gabriel Weinberg & Justin Mares', url: 'https://www.tractionbook.com/', idea: 'Rank 19 channels, test the top 3, focus on the winner.' },
    ],
  },

  revenue: {
    goal: 'Make money from users in a way that makes each customer worth more than they cost.',
    days: 28,
    steps: [
      { title: 'Charge something, early', how: ['Payment is the strongest validation there is.', 'Start with a simple price; you can change it later.', 'Use M-Pesa (paybill/till or Daraja) so it is easy to pay in Kenya.'], minutes: 60 },
      { title: 'Choose the revenue model', how: ['Subscription, per-transaction fee, freemium, or B2B licence?', 'Pick the one that matches how users get value.'], minutes: 45 },
      { title: 'Work out unit economics', how: ['CAC: what it costs to win one paying customer.', 'LTV: what one customer pays you over their lifetime.', 'Aim for LTV at least 3x CAC.'], minutes: 60 },
      { title: 'Test prices', how: ['Raise the price for new customers and see who still says yes.', 'Offer a higher tier for power users.'], minutes: 60 },
      { title: 'Check if you are default alive', how: ['At your current growth and costs, will you become profitable before money runs out?', 'If not: cut costs, raise prices, or raise money — decide now.'], minutes: 45 },
    ],
    gate: [
      'Real customers pay me',
      'I know my CAC and LTV, even roughly',
      'My monthly revenue is growing',
      'I know whether I am "default alive"',
    ],
    mistakes: [
      'Staying free too long out of fear of losing users.',
      'Pricing by cost instead of by value to the customer.',
      'Ignoring churn while chasing new revenue.',
    ],
    reads: [
      { title: 'Default Alive or Default Dead?', author: 'Paul Graham', url: 'http://paulgraham.com/aord.html', idea: 'Know whether your current trajectory reaches profitability before cash runs out.' },
      { title: 'Stripe Atlas guides', author: 'Stripe', url: 'https://stripe.com/guides/atlas', idea: 'Practical guides on pricing, business models and running a company.' },
    ],
  },

  expansion: {
    goal: 'Grow into new markets, segments or products without breaking what already works.',
    days: 28,
    steps: [
      { title: 'Dominate your first market', how: ['Do you lead in your first city/segment? If not, keep going there first.'], minutes: 30 },
      { title: 'Pick the next market with data', how: ['Where do users already come from without effort?', 'Which market is most similar to your first one?'], minutes: 60 },
      { title: 'Adapt, don’t rebuild', how: ['Language, payment methods, regulation, local partners.', 'Talk to 5 local users before launching there.'], minutes: 120 },
      { title: 'Run a small expansion pilot', how: ['Same pilot playbook: a group, a timeline, a success number.'], minutes: 120 },
      { title: 'Formalise the company', how: ['Register the business (eCitizen BRS in Kenya), KRA PIN, a business bank account.', 'Basic contracts and data protection compliance (Kenya Data Protection Act).'], minutes: 60 },
    ],
    gate: [
      'I lead or am clearly growing in my first market',
      'I chose the next market based on evidence',
      'The business is registered and compliant',
      'An expansion pilot has a success number',
    ],
    mistakes: [
      'Expanding to escape a first market that is not working.',
      'Copy-pasting the product without local adaptation.',
      'Opening several new markets at once.',
    ],
    reads: [
      { title: 'Business Registration Service (Kenya)', author: 'Government of Kenya', url: 'https://brs.go.ke/', idea: 'Register a business name or company online.' },
    ],
  },

  exit: {
    goal: 'Decide the long-term future: keep growing, raise big, get acquired, or run it profitably.',
    days: 28,
    steps: [
      { title: 'Know your numbers cold', how: ['Revenue, growth, margins, retention, burn — updated monthly.', 'Keep a simple data room (Google Drive) with them.'], minutes: 60 },
      { title: 'Decide what success means to you', how: ['Write where you want this in 10 years and what you want from it.', 'Profitable lifestyle business, venture-scale, or sale are all valid.'], minutes: 45 },
      { title: 'Map possible acquirers and partners', how: ['Which companies would benefit most from owning this?', 'Build real relationships with them long before any sale.'], minutes: 60 },
      { title: 'Understand funding documents', how: ['Learn what SAFEs, equity rounds and dilution mean before you sign anything.', 'Get a lawyer for anything binding.'], minutes: 60 },
    ],
    gate: [
      'I have monthly numbers and a data room',
      'I have written my long-term vision and what I want',
      'I understand the funding or exit options and their trade-offs',
    ],
    mistakes: [
      'Building only to sell — buyers want companies that do not need to be sold.',
      'Signing term sheets without understanding them.',
    ],
    reads: [
      { title: 'A Guide to Seed Fundraising', author: 'Geoff Ralston (Y Combinator)', url: 'https://www.ycombinator.com/library/4A-a-guide-to-seed-fundraising', idea: 'How seed rounds work, from SAFEs to talking to investors.' },
      { title: 'YC Documents (SAFE)', author: 'Y Combinator', url: 'https://www.ycombinator.com/documents', idea: 'The standard SAFE documents and how they work.' },
    ],
  },
};

// The founder library: guides that apply across stages.
export const LIBRARY = [
  { topic: 'Ideas & users', title: 'How to Get Startup Ideas', author: 'Paul Graham', url: 'http://paulgraham.com/startupideas.html' },
  { topic: 'Ideas & users', title: 'The Mom Test', author: 'Rob Fitzpatrick', url: 'https://www.momtestbook.com/' },
  { topic: 'Ideas & users', title: 'YC Startup School (free course)', author: 'Y Combinator', url: 'https://www.startupschool.org/' },
  { topic: 'Building', title: 'The Lean Startup', author: 'Eric Ries', url: 'http://theleanstartup.com/' },
  { topic: 'Building', title: 'Do Things That Don’t Scale', author: 'Paul Graham', url: 'http://paulgraham.com/ds.html' },
  { topic: 'Building', title: 'Safaricom Daraja (M-Pesa API)', author: 'Safaricom', url: 'https://developer.safaricom.co.ke/' },
  { topic: 'Product-market fit', title: 'The only thing that matters', author: 'Marc Andreessen', url: 'https://pmarchive.com/guide_to_startups_part4.html' },
  { topic: 'Product-market fit', title: 'Superhuman’s PMF engine', author: 'Rahul Vohra', url: 'https://review.firstround.com/how-superhuman-built-an-engine-to-find-product-market-fit' },
  { topic: 'Growth & marketing', title: 'Startup = Growth', author: 'Paul Graham', url: 'http://paulgraham.com/growth.html' },
  { topic: 'Growth & marketing', title: 'Traction (Bullseye framework)', author: 'Weinberg & Mares', url: 'https://www.tractionbook.com/' },
  { topic: 'Growth & marketing', title: 'Product Hunt launch guide', author: 'Product Hunt', url: 'https://www.producthunt.com/launch' },
  { topic: 'Money & metrics', title: 'Default Alive or Default Dead?', author: 'Paul Graham', url: 'http://paulgraham.com/aord.html' },
  { topic: 'Money & metrics', title: '16 Startup Metrics', author: 'a16z', url: 'https://a16z.com/16-startup-metrics/' },
  { topic: 'Pitching & fundraising', title: 'How to Pitch Your Company', author: 'Michael Seibel (YC)', url: 'https://www.ycombinator.com/library/4b-how-to-pitch-your-company' },
  { topic: 'Pitching & fundraising', title: 'Writing a Business Plan (pitch outline)', author: 'Sequoia Capital', url: 'https://www.sequoiacap.com/article/writing-a-business-plan/' },
  { topic: 'Pitching & fundraising', title: 'A Guide to Seed Fundraising', author: 'Geoff Ralston (YC)', url: 'https://www.ycombinator.com/library/4A-a-guide-to-seed-fundraising' },
  { topic: 'Running the company', title: 'Stripe Atlas guides', author: 'Stripe', url: 'https://stripe.com/guides/atlas' },
  { topic: 'Running the company', title: 'Business Registration Service (Kenya)', author: 'Government of Kenya', url: 'https://brs.go.ke/' },
];

// The 10-slide pitch, in the order investors expect (Sequoia / YC style).
export const PITCH_SLIDES = [
  { key: 'problem', title: 'Problem', hint: 'Who hurts, how much, how often. Use a real story or number.' },
  { key: 'solution', title: 'Solution', hint: 'What you built and the moment it makes life better.' },
  { key: 'why_now', title: 'Why now', hint: 'What changed (tech, behaviour, regulation) that makes this possible today.' },
  { key: 'market', title: 'Market', hint: 'How many people/businesses have this problem and what they spend.' },
  { key: 'product', title: 'Product', hint: 'How it works — the core flow in 3 steps.' },
  { key: 'traction', title: 'Traction', hint: 'Users, growth, pilot results, revenue. Numbers beat adjectives.' },
  { key: 'business_model', title: 'Business model', hint: 'How you make money and what one customer is worth.' },
  { key: 'competition', title: 'Competition', hint: 'What people use today and why you win.' },
  { key: 'team', title: 'Team', hint: 'Why you are the people to build this.' },
  { key: 'ask', title: 'The ask', hint: 'How much you want, what it buys, and the milestone it gets you to.' },
];

// Who sits across the table in the Investor Room.
export const INVESTORS = [
  { id: 'angel', name: 'Wanjiru', role: 'Angel investor, Nairobi', emoji: '👩🏾‍💼', style: 'Friendly but sharp angel who invested in 12 Kenyan startups. Cares about the founder, the problem and early traction. Writes KSh 500k–2M cheques.' },
  { id: 'seed', name: 'Daniel', role: 'Seed VC partner', emoji: '🧑🏽‍💻', style: 'Fast-talking seed VC in the style of a YC partner. Wants clarity, growth rate, market size and why this team will win. Interrupts vague answers.' },
  { id: 'impact', name: 'Amara', role: 'Impact fund, pan-African', emoji: '🌍', style: 'Impact investor focused on African markets. Cares about social impact metrics, unit economics and sustainability as much as growth.' },
  { id: 'skeptic', name: 'Mr. Otieno', role: 'Skeptical corporate investor', emoji: '🧔🏾', style: 'Tough, skeptical corporate investor. Pushes on competition, regulation, risks and whether this can make money. Hard to impress.' },
];

// Judging criteria for the pitch judge.
export const JUDGE_CRITERIA = ['Problem clarity', 'Solution & product', 'Market size', 'Traction & evidence', 'Business model', 'Competition & edge', 'Team', 'Clarity of the ask'];

// Short text of a stage's playbook entry, for the AI prompts.
export function playbookText(stageId) {
  const p = PLAYBOOK[stageId];
  if (!p) return '';
  return [
    `Stage goal: ${p.goal}`,
    `Playbook steps:\n${p.steps.map((s, i) => `${i + 1}. ${s.title} — ${s.how.join(' ')}`).join('\n')}`,
    `Ready to move on when:\n${p.gate.map((g) => `- ${g}`).join('\n')}`,
    `Common mistakes:\n${p.mistakes.map((m) => `- ${m}`).join('\n')}`,
  ].join('\n');
}
