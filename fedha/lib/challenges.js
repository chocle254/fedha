// Savings challenge templates inspired by popular savings apps.
// Each template knows how many periods it has and how much to save per period.

export const CHALLENGE_TEMPLATES = [
  {
    id: '52week',
    name: '52-Week Challenge',
    emoji: '📈',
    blurb: 'Save a little more each week. Week 1 you stash one step, week 52 you stash fifty-two.',
    periodLabel: 'week',
    periods: 52,
    defaultStep: 100,
    stepLabel: 'Weekly step',
    amountFor: (i, step) => step * (i + 1),
  },
  {
    id: 'envelope100',
    name: '100 Envelope Challenge',
    emoji: '✉️',
    blurb: 'Fill 100 envelopes numbered 1–100. Each day grab an envelope and stash that many steps.',
    periodLabel: 'envelope',
    periods: 100,
    defaultStep: 10,
    stepLabel: 'Per-envelope step',
    amountFor: (i, step) => step * (i + 1),
  },
  {
    id: 'coinaday',
    name: 'Coin-a-Day (365)',
    emoji: '🪙',
    blurb: 'Day 1 save one step, day 2 save two… by day 365 you have built a serious stash.',
    periodLabel: 'day',
    periods: 365,
    defaultStep: 5,
    stepLabel: 'Daily step',
    amountFor: (i, step) => step * (i + 1),
  },
  {
    id: 'jar30',
    name: '30-Day Money Jar',
    emoji: '🫙',
    blurb: 'Drop the same amount into the jar every day for 30 days. Consistency beats intensity.',
    periodLabel: 'day',
    periods: 30,
    defaultStep: 200,
    stepLabel: 'Daily amount',
    amountFor: (i, step) => step,
  },
  {
    id: 'payday12',
    name: 'Payday Pledge',
    emoji: '💰',
    blurb: 'Pay yourself first. Stash a fixed amount every month for a year before you spend a shilling.',
    periodLabel: 'month',
    periods: 12,
    defaultStep: 2000,
    stepLabel: 'Monthly amount',
    amountFor: (i, step) => step,
  },
  {
    id: 'nospend',
    name: 'No-Spend Sprint',
    emoji: '🚫',
    blurb: 'Go a set number of days without logging an expense. Tracked automatically from your transactions.',
    periodLabel: 'day',
    periods: 14,
    defaultStep: 0,
    auto: true,
    amountFor: () => 0,
  },
];

export function getTemplate(id) {
  return CHALLENGE_TEMPLATES.find((t) => t.id === id);
}

// Total target across all periods for a given step.
export function challengeTarget(template, step) {
  let total = 0;
  for (let i = 0; i < template.periods; i++) total += template.amountFor(i, step);
  return total;
}

// Saved-so-far given a list of completed period indexes.
export function challengeSaved(template, step, completed = []) {
  return completed.reduce((s, i) => s + template.amountFor(i, step), 0);
}

// First period index that has not been completed yet (or -1 if done).
export function nextPeriodIndex(template, completed = []) {
  const done = new Set(completed);
  for (let i = 0; i < template.periods; i++) if (!done.has(i)) return i;
  return -1;
}
