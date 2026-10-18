// Shared startup-journey data: the 8 stages, progress maths, streaks and
// the little "Muse" helpers used by the startup page and the Tech Hub list.
import { todayISO, localISO } from "./utils";

// Stage definitions — each stage has fields revealed when you open it.
export const STAGES = [
  {
    id: 'ideation', label: 'Ideation', emoji: '💡', color: '#F59E0B',
    blurb: 'Define the problem and validate that it is worth solving.',
    fields: [
      { key: 'problem', label: 'The Problem', placeholder: 'What painful problem are you solving? Who has it?' },
      { key: 'solution', label: 'The Solution', placeholder: 'How does your idea solve it?' },
      { key: 'project', label: 'The Project', placeholder: 'What exactly are you building? Scope & name.' },
      { key: 'validation', label: 'Problem Validation', placeholder: 'Evidence the problem is real — interviews, signups, data…' },
    ],
  },
  {
    id: 'prototyping', label: 'Prototyping', emoji: '🛠️', color: '#3B82F6',
    blurb: 'Build something testable and learn fast.',
    fields: [
      { key: 'tech_stack', label: 'Tech Stack', placeholder: 'Languages, frameworks, tools' },
      { key: 'key_features', label: 'Key Features', placeholder: 'Core features the prototype must show' },
      { key: 'prototype_link', label: 'Prototype / Demo Link', placeholder: 'Figma, repo, or live link' },
      { key: 'learnings', label: 'Learnings', placeholder: 'What did testing the prototype teach you?' },
    ],
  },
  {
    id: 'mvp', label: 'MVP', emoji: '🚀', color: '#10B981',
    blurb: 'Ship the smallest thing real users can use.',
    fields: [
      { key: 'launch_status', label: 'Launch Status', placeholder: 'Not launched / Beta / Live' },
      { key: 'target_users', label: 'Target Users', placeholder: 'Who are the first users?' },
      { key: 'metrics', label: 'Key Metrics', placeholder: 'Signups, retention, revenue…' },
      { key: 'next_steps', label: 'Next Steps', placeholder: 'What comes after the MVP?' },
    ],
  },
  {
    id: 'pilot', label: 'Pilot', emoji: '🧪', color: '#A855F7',
    blurb: 'Run the MVP with a small group of real users and measure what happens.',
    fields: [
      { key: 'pilot_group', label: 'Pilot Group', placeholder: 'Who exactly is in the pilot? How many, and how did you find them?' },
      { key: 'success_metric', label: 'Success Metric', placeholder: 'What number proves the pilot worked? e.g. 6 of 10 use it every week' },
      { key: 'pilot_timeline', label: 'Pilot Timeline', placeholder: 'Start and end dates, and how often you check in with users' },
      { key: 'pilot_results', label: 'Pilot Results', placeholder: 'What happened? Usage, quotes, what broke, what surprised you' },
    ],
  },
  {
    id: 'launch', label: 'Launch', emoji: '📣', color: '#F97316',
    blurb: 'Ship publicly and win your first wave of users.',
    fields: [
      { key: 'launch_date', label: 'Launch Date', placeholder: 'When are you going public? Pick a real date.' },
      { key: 'launch_message', label: 'Launch Message', placeholder: 'One sentence: who it is for and what it does for them' },
      { key: 'launch_channels', label: 'Launch Channels', placeholder: 'Where will you announce? WhatsApp groups, X, LinkedIn, Product Hunt, campus…' },
      { key: 'launch_results', label: 'Launch Results', placeholder: 'Signups, active users, feedback in the first 2 weeks' },
    ],
  },
  {
    id: 'pmf', label: 'Product-Market Fit', emoji: '🎯', color: '#8B5CF6',
    blurb: 'Refine based on user feedback until retention is strong.',
    fields: [
      { key: 'retention_metrics', label: 'Retention Metrics', placeholder: 'DAU/MAU, churn rate, retention curves' },
      { key: 'user_feedback', label: 'User Feedback Insights', placeholder: 'Key patterns from user interviews & support' },
      { key: 'product_changes', label: 'Product Changes', placeholder: 'Major pivots or refinements made' },
      { key: 'market_fit_signals', label: 'Market Fit Signals', placeholder: 'How do you know you have PMF? (e.g. viral coefficient, NPS score)' },
    ],
  },
  {
    id: 'growth', label: 'Growth / Scaling', emoji: '📈', color: '#EC4899',
    blurb: 'Marketing, partnerships, hiring.',
    fields: [
      { key: 'marketing_strategy', label: 'Marketing Strategy', placeholder: 'Channels: organic, paid, partnerships, referral…' },
      { key: 'team_size', label: 'Team Size & Hires', placeholder: 'Who have you hired? What roles still needed?' },
      { key: 'partnerships', label: 'Key Partnerships', placeholder: 'Strategic alliances or integrations' },
      { key: 'growth_metrics', label: 'Growth Metrics', placeholder: 'MoM growth rate, CAC, LTV, paid channel ROI' },
    ],
  },
  {
    id: 'revenue', label: 'Revenue & Monetization', emoji: '💰', color: '#06B6D4',
    blurb: 'Sustainable business model.',
    fields: [
      { key: 'revenue_model', label: 'Revenue Model', placeholder: 'Freemium, subscription, transaction fees, licensing…' },
      { key: 'pricing_strategy', label: 'Pricing Strategy', placeholder: 'Tiers, pricing, discounts, enterprise deals' },
      { key: 'current_arr', label: 'Current ARR / Revenue', placeholder: 'Annual Recurring Revenue or MRR' },
      { key: 'unit_economics', label: 'Unit Economics', placeholder: 'Gross margin, CAC payback period, LTV:CAC ratio' },
    ],
  },
  {
    id: 'expansion', label: 'Expansion', emoji: '🌍', color: '#14B8A6',
    blurb: 'New markets, features, or geographies.',
    fields: [
      { key: 'new_markets', label: 'New Markets / Geographies', placeholder: 'Target regions: Africa, Asia, Europe…' },
      { key: 'new_features', label: 'New Product Lines', placeholder: 'Adjacent features or new verticals' },
      { key: 'localization', label: 'Localization & Adaptation', placeholder: 'Language, culture, compliance, payment methods' },
      { key: 'expansion_timeline', label: 'Expansion Timeline', placeholder: 'Roadmap: when, where, how?' },
    ],
  },
  {
    id: 'exit', label: 'Exit / Maturity', emoji: '🏁', color: '#6366F1',
    blurb: 'Acquisition, IPO, or long-term sustainability.',
    fields: [
      { key: 'exit_strategy', label: 'Exit Strategy', placeholder: 'IPO, acquisition, stay private, wind down' },
      { key: 'acquisition_targets', label: 'Potential Acquirers', placeholder: 'Which companies might buy you?' },
      { key: 'valuation', label: 'Current Valuation', placeholder: 'Latest valuation / funding round' },
      { key: 'long_term_vision', label: 'Long-Term Vision', placeholder: 'Where do you see this in 10 years?' },
    ],
  },
];

export function stageProgress(stageData, fields) {
  if (!stageData) return 0;
  const filled = fields.filter((f) => stageData[f.key]?.trim()).length;
  return Math.round((filled / fields.length) * 100);
}

// Count total filled fields across all stages
export function totalProgress(stages, draftStages) {
  let total = 0, filled = 0;
  stages.forEach((s) => {
    s.fields.forEach((f) => {
      total++;
      if (draftStages[s.id]?.[f.key]?.trim()) filled++;
    });
  });
  return total > 0 ? Math.round((filled / total) * 100) : 0;
}

// Short, stage-specific nudges in plain words (not quotes) — one per day.
export const NUDGES = {
  ideation: ['Talk to five people who have this problem before writing more code.', 'Write the problem in one sentence a stranger would understand.', 'Find out what people use today instead — that is your real competitor.'],
  prototyping: ['Cut the prototype to the one feature that proves the idea.', 'Put it in front of one real user this week and watch them use it.', 'Ugly and tested beats beautiful and untested.'],
  mvp: ['Ship to ten users before adding another feature.', 'Pick one number that shows people get value, and check it daily.', 'Launch before you feel ready — you learn faster live.'],
  pilot: ['Agree the success number with yourself before the pilot starts.', 'Check in with every pilot user this week — silence is data too.', 'Write down every bug and complaint the same day you hear it.'],
  launch: ['Pick a launch date and tell someone — a date makes it real.', 'Launch where your users already hang out, not where it feels impressive.', 'Reply to every comment and signup on launch day personally.'],
  pmf: ['Ask users how disappointed they would be if it disappeared.', 'Double down on the users who use it most, not the ones who complain loudest.', 'Retention is the truth — fix the leak before pouring in more users.'],
  growth: ['Find the one channel that works and push it hard before trying others.', 'Make it easy for happy users to bring friends.', 'Hire only for the bottleneck that is slowing you down most.'],
  revenue: ['Charge earlier than feels comfortable — payment is the best validation.', 'Know what one customer costs you to win and what they pay you.', 'Raise prices for new customers and see who still says yes.'],
  expansion: ['Win one new market fully before opening the next.', 'Talk to local users first — every market has its own payment and trust habits.', 'Expand what already works; do not rebuild from scratch.'],
  exit: ['Build the company you would want to keep, not just sell.', 'Know your numbers cold — buyers and investors will.', 'Write down what success looks like in ten years and check today against it.'],
};

// Consecutive days (ending today, or yesterday if today isn't logged yet)
// with at least one progress entry.
export function streakOf(log) {
  const days = new Set((log || []).map((l) => l.date));
  const d = new Date();
  const iso = (x) => localISO(x);
  if (!days.has(todayISO())) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(iso(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// Where the startup is now: the first stage that isn't fully answered.
export function journeyState(stages = {}) {
  const idx = STAGES.findIndex((st) => stageProgress(stages[st.id], st.fields) < 100);
  const allDone = idx === -1;
  const currentIdx = allDone ? STAGES.length - 1 : idx;
  return { allDone, currentIdx, stage: STAGES[currentIdx], pct: totalProgress(STAGES, stages) };
}

// Questions still unanswered in a stage, in order.
export function openQuestions(stages = {}, stage) {
  return stage.fields.filter((f) => !stages[stage.id]?.[f.key]?.trim());
}


export function addDaysISO(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return localISO(d);
}

// The dated roadmap for the current stage. Older startups kept an undated
// "plan" — show it as a roadmap with no dates so nothing is lost.
export function roadmapOf(startup) {
  if (startup?.roadmap?.tasks) return startup.roadmap;
  if (startup?.plan?.tasks?.length) {
    return { stage: startup.plan.stage, stage_label: startup.plan.stage_label, created: startup.plan.created, tasks: startup.plan.tasks.map((t) => ({ ...t, title: t.title || t.text, how: t.how || (t.why ? [t.why] : []), date: t.date || null })) };
  }
  return null;
}

// Tasks to do today: due today or overdue, not done.
export function dueTasks(roadmap, today = todayISO()) {
  return (roadmap?.tasks || []).filter((t) => !t.done && t.date && t.date <= today).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
}

// Without the AI: spread the stage's playbook steps across its usual length.
export function fallbackRoadmap(stageId, playbook, startDate = todayISO()) {
  const p = playbook[stageId];
  if (!p) return [];
  const n = p.steps.length;
  return p.steps.map((st, i) => ({
    title: st.title,
    how: st.how,
    minutes: st.minutes || 60,
    day: Math.round((i * (p.days - 1)) / Math.max(1, n - 1)),
  })).map((t) => ({ ...t, date: addDaysISO(startDate, t.day) }));
}

const daysBetween2 = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);

// Muse "checks back in": the one thing worth saying about this startup today.
// Returns { tone, text, action } or null. action is 'log' | 'focus' | 'plan' | 'today'.
export function museNotice(startup) {
  if (!startup) return null;
  const today = todayISO();
  const name = startup.name || 'your startup';
  const focus = startup.focus;
  const roadmap = roadmapOf(startup);
  const { stage } = journeyState(startup.stages || {});
  const overdue = (roadmap?.tasks || []).filter((t) => !t.done && t.date && t.date < today);
  const todays = (roadmap?.tasks || []).filter((t) => !t.done && t.date === today);
  if (overdue.length) {
    return { tone: 'warn', text: `${overdue.length} roadmap task${overdue.length === 1 ? ' is' : 's are'} overdue, starting with "${overdue[0].title}". Do it today or tap Re-plan to spread the rest out again.`, action: 'today' };
  }
  if (focus && !focus.done && focus.due && focus.due < today) {
    const n = daysBetween2(focus.due, today);
    return { tone: 'warn', text: `Your commitment "${focus.text}" is ${n} day${n === 1 ? '' : 's'} overdue. Finish it today, or reset it to something you can do.`, action: 'focus' };
  }
  if (todays.length) {
    return { tone: 'info', text: `Today on the roadmap: "${todays[0].title}"${todays.length > 1 ? ` and ${todays.length - 1} more` : ''}. It's in your planner with the steps.`, action: 'today' };
  }
  if (roadmap?.tasks?.length && roadmap.tasks.every((t) => t.done)) {
    return { tone: 'win', text: `You finished the whole ${roadmap.stage_label || ''} roadmap. Check the Readiness tab, then let me schedule the next stage.`, action: 'plan' };
  }
  if (roadmap?.stage && roadmap.stage !== stage.id && roadmap.tasks?.some((t) => !t.done)) {
    return { tone: 'info', text: `${name} has moved to ${stage.label}. Your roadmap is still for ${roadmap.stage_label || roadmap.stage} — want a fresh one?`, action: 'plan' };
  }
  const log = startup.log || [];
  if (log.length) {
    const gap = daysBetween2(log[0].date, today);
    if (gap >= 3) return { tone: 'warn', text: `It's been ${gap} days since you moved ${name} forward. What's one small thing you can do today?`, action: 'log' };
  }
  if (!roadmap?.tasks?.length) return { tone: 'info', text: `Let me schedule ${stage.label} for you: a step-by-step roadmap with dates, added straight to your planner.`, action: 'plan' };
  if (!log.length) return { tone: 'info', text: `Log one thing you did for ${name} today. Small steps every day beat big pushes once a month.`, action: 'log' };
  if (!focus || focus.done) return { tone: 'info', text: `No commitment for this week yet. Pick one thing you'll finish in 7 days.`, action: 'focus' };
  return null;
}
