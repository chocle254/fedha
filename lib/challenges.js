// Savings challenge templates + milestone rewards.
export const MILESTONES = [
  { pct: 25,  badge: '🥉', title: 'Quarter Crusher' },
  { pct: 50,  badge: '🥈', title: 'Halfway Hero' },
  { pct: 75,  badge: '🥇', title: 'Final Stretch' },
  { pct: 100, badge: '🏆', title: 'Champion' },
];

export const CHALLENGE_TEMPLATES = [
  { id: '52week', name: '52-Week Challenge', emoji: '📈', tier: 'Classic',
    blurb: 'Save a little more each week. Week 1 one step, week 52 fifty-two.',
    periodLabel: 'week', periods: 52, defaultStep: 100, stepLabel: 'Weekly step',
    amountFor: (i, step) => step * (i + 1) },

  { id: 'envelope100', name: '100 Envelope Challenge', emoji: '✉️', tier: 'Classic',
    blurb: 'Fill 100 numbered envelopes. Each day grab one and stash that many steps.',
    periodLabel: 'envelope', periods: 100, defaultStep: 10, stepLabel: 'Per-envelope step',
    amountFor: (i, step) => step * (i + 1) },

  { id: 'coinaday', name: 'Coin-a-Day (365)', emoji: '🪙', tier: 'Marathon',
    blurb: 'Day 1 save one step, day 2 two… by day 365 a serious stash.',
    periodLabel: 'day', periods: 365, defaultStep: 5, stepLabel: 'Daily step',
    amountFor: (i, step) => step * (i + 1) },

  { id: 'jar30', name: '30-Day Money Jar', emoji: '🫙', tier: 'Quick Win',
    blurb: 'Drop the same amount into the jar every day for 30 days.',
    periodLabel: 'day', periods: 30, defaultStep: 200, stepLabel: 'Daily amount',
    amountFor: (i, step) => step },

  { id: 'payday12', name: 'Payday Pledge', emoji: '💰', tier: 'Classic',
    blurb: 'Pay yourself first. Stash a fixed amount every month for a year.',
    periodLabel: 'month', periods: 12, defaultStep: 2000, stepLabel: 'Monthly amount',
    amountFor: (i, step) => step },

  // ── NEW ──────────────────────────────────────────────────────────────────
  { id: 'roundup100', name: 'Round-Up Rush', emoji: '🔄', tier: 'Quick Win',
    blurb: 'Round every spend up to the nearest 100 and stash the difference — 60 micro-saves.',
    periodLabel: 'round-up', periods: 60, defaultStep: 50, stepLabel: 'Avg round-up',
    amountFor: (i, step) => step },

  { id: 'weekend24', name: 'Weekend Warrior', emoji: '🎉', tier: 'Habit',
    blurb: 'Skip one treat every weekend and bank it instead — 24 weekends.',
    periodLabel: 'weekend', periods: 24, defaultStep: 500, stepLabel: 'Per-weekend save',
    amountFor: (i, step) => step },

  { id: 'sprint5k', name: '5K Sprint', emoji: '⚡', tier: 'Quick Win',
    blurb: 'Hit a 5,000 target in 10 escalating steps. Fast, addictive, satisfying.',
    periodLabel: 'step', periods: 10, defaultStep: 100, stepLabel: 'Base step',
    amountFor: (i, step) => step * (i + 1) },

  { id: 'biggoal100', name: '100-Day Big Goal', emoji: '🎯', tier: 'Marathon',
    blurb: 'Bank a steady amount every day for 100 days toward something big.',
    periodLabel: 'day', periods: 100, defaultStep: 300, stepLabel: 'Daily amount',
    amountFor: (i, step) => step },

  { id: 'fiftytwo_reverse', name: 'Reverse 52', emoji: '🪂', tier: 'Classic',
    blurb: 'Start big while motivation is high — week 1 is the largest, then ease down.',
    periodLabel: 'week', periods: 52, defaultStep: 100, stepLabel: 'Weekly step',
    amountFor: (i, step) => step * (52 - i) },

  { id: 'nospend', name: 'No-Spend Sprint', emoji: '🚫', tier: 'Habit', auto: true,
    blurb: 'Go a set number of days without logging an expense. Tracked automatically.',
    periodLabel: 'day', periods: 14, defaultStep: 0, amountFor: () => 0 },

  { id: 'nospend30', name: 'No-Spend Month', emoji: '🛡️', tier: 'Marathon', auto: true,
    blurb: 'The 30-day version for the truly disciplined. Auto-tracked from transactions.',
    periodLabel: 'day', periods: 30, defaultStep: 0, amountFor: () => 0 },
];

export function getTemplate(id) { return CHALLENGE_TEMPLATES.find((t) => t.id === id); }

export function challengeTarget(template, step) {
  let total = 0;
  for (let i = 0; i < template.periods; i++) total += template.amountFor(i, step);
  return total;
}
export function challengeSaved(template, step, completed = []) {
  return completed.reduce((s, i) => s + template.amountFor(i, step), 0);
}
export function nextPeriodIndex(template, completed = []) {
  const done = new Set(completed);
  for (let i = 0; i < template.periods; i++) if (!done.has(i)) return i;
  return -1;
}

// Returns the highest milestone newly crossed between two percentages (or null).
export function milestoneCrossed(prevPct, newPct) {
  let hit = null;
  for (const m of MILESTONES) if (prevPct < m.pct && newPct >= m.pct) hit = m;
  return hit;
}
// Badges earned at a given percentage (for display).
export function earnedBadges(pct) { return MILESTONES.filter((m) => pct >= m.pct); }
