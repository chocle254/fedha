// Builds the context Jarvis sees on every turn: a compact summary of the
// user's whole world in Fedha — money, schedule, meals, workouts, upcoming
// deadlines. This is deliberately a SUMMARY, not a raw dump of every table:
// sending years of transaction history or every historical workout would
// blow past context limits and cost, and most of it is irrelevant to any
// single conversation. Instead each section keeps only what's likely to
// matter "right now" — recent activity, active items, upcoming dates.
//
// If you add a new page/feature and want Jarvis aware of it, add a section
// here following the same pattern: fetch, summarize to a few lines, done.

import {
  getWallets, getTransactions, getBudgets, getLoans, getIncomePlans,
  getGoals, getSetting, getFoodLogs, getHackathons, getProjects, getCertificates, getStartups,
} from './db';
import { todayISO, countdownTo, formatShort } from './utils';

const RECENT_TRANSACTION_COUNT = 15;

function fmtCountdown(dateStr) {
  const c = countdownTo(dateStr);
  if (!c) return null;
  if (c.past) return 'overdue';
  if (c.days > 0) return `${c.days}d ${c.hours}h`;
  return `${c.hours}h ${c.minutes}m`;
}

async function summarizeMoney() {
  const [wallets, transactions, budgets, loans, incomePlans, goals] = await Promise.all([
    getWallets(), getTransactions(), getBudgets(), getLoans(), getIncomePlans(), getGoals(),
  ]);

  const totalBalance = wallets.reduce((s, w) => s + (Number(w.balance) || 0), 0);
  const walletLines = wallets.map((w) => `${w.name}: ${formatShort(Number(w.balance) || 0)}`);

  const recent = transactions.slice(0, RECENT_TRANSACTION_COUNT).map((t) =>
    `${t.date} ${t.type} ${formatShort(Number(t.amount))} (${t.category}${t.description ? ': ' + t.description : ''})`
  );

  const budgetLines = budgets.map((b) => {
    const pct = b.allocated ? Math.round((Number(b.spent || 0) / Number(b.allocated)) * 100) : 0;
    return `${b.name} (${b.category}): ${formatShort(Number(b.spent || 0))} / ${formatShort(Number(b.allocated))} spent (${pct}%)${pct >= 90 ? ' ⚠️ nearly/over limit' : ''}`;
  });

  const activeLoans = loans.filter((l) => l.status === 'active').map((l) => {
    const due = l.due_date ? ` due ${l.due_date} (${fmtCountdown(l.due_date)})` : '';
    return `${l.type === 'borrowed' ? 'You owe' : 'Owed to you by'} ${l.contact_name}: ${formatShort(Number(l.remaining || l.amount))}${due}`;
  });

  const pendingIncome = incomePlans.filter((p) => !p.is_received).map((p) => {
    const due = p.expected_date ? ` expected ${p.expected_date} (${fmtCountdown(p.expected_date)})` : '';
    return `${p.name}: ${formatShort(Number(p.expected_amount))}${due}`;
  });

  const goalLines = goals.filter((g) => (g.current || 0) < g.target).map((g) => {
    const pct = g.target ? Math.round(((g.current || 0) / g.target) * 100) : 0;
    return `${g.name}: ${formatShort(Number(g.current || 0))} / ${formatShort(Number(g.target))} (${pct}%)`;
  });

  return [
    `Total balance across all wallets: ${formatShort(totalBalance)}`,
    walletLines.length ? `Wallets: ${walletLines.join('; ')}` : null,
    budgetLines.length ? `Budgets:\n- ${budgetLines.join('\n- ')}` : 'No budgets set.',
    activeLoans.length ? `Active loans:\n- ${activeLoans.join('\n- ')}` : null,
    pendingIncome.length ? `Pending income (not yet received):\n- ${pendingIncome.join('\n- ')}` : null,
    goalLines.length ? `Savings goals in progress:\n- ${goalLines.join('\n- ')}` : null,
    recent.length ? `Last ${recent.length} transactions:\n- ${recent.join('\n- ')}` : 'No transactions yet.',
  ].filter(Boolean).join('\n\n');
}

async function summarizePlanner() {
  const blocks = await getSetting('planner_blocks', null);
  const notifsOn = await getSetting('planner_notifs', false);
  if (!blocks?.length) return 'No planner schedule set for today.';

  const completed = await getSetting(`planner_done_${todayISO()}`, []);
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  const lines = blocks.map((b) => {
    const [h, m] = b.time.split(':').map(Number);
    const blockMins = h * 60 + m;
    const done = completed.includes(b.id);
    const status = done ? '✓ done' : blockMins < nowMins ? '✗ missed/skipped' : blockMins - nowMins <= 30 ? '⏳ coming up soon' : 'upcoming';
    return `${b.time} ${b.label} (${b.type}) — ${status}`;
  });

  const doneCount = blocks.filter((b) => completed.includes(b.id)).length;
  return `Notifications ${notifsOn ? 'ON' : 'OFF'}. Progress: ${doneCount}/${blocks.length} blocks done today.\n${lines.join('\n')}`;
}

async function summarizeMeals() {
  const logs = await getFoodLogs(todayISO());
  if (!logs?.length) return "No meals logged today yet.";
  const totalCal = logs.reduce((s, l) => s + (Number(l.cal) || 0) * (Number(l.qty) || 1), 0);
  const items = logs.map((l) => `${l.slot || 'meal'}: ${l.name} (${l.cal || '?'} cal${l.qty > 1 ? ` x${l.qty}` : ''})`);
  return `Today's meals logged (${totalCal} cal total):\n- ${items.join('\n- ')}`;
}

async function summarizeDeadlines() {
  const hackathons = await getHackathons();
  const upcoming = hackathons
    .filter((h) => h.deadline && !countdownTo(h.deadline)?.past)
    .map((h) => `${h.name}: deadline ${h.deadline} (${fmtCountdown(h.deadline)})`);
  return upcoming.length ? `Upcoming hackathon/project deadlines:\n- ${upcoming.join('\n- ')}` : null;
}

// Full career/portfolio picture — used for CV drafting and feature-idea
// suggestions, so those requests are grounded in what the user has
// actually built rather than invented. Kept separate from the always-on
// context sections above since it's a fair amount of text and not every
// conversation needs it — buildJarvisContext() includes it always for now
// (the summaries are compact), but this is the section to trim first if
// context size ever becomes a real problem.
async function summarizeCareer() {
  const [projects, hackathons, startups, certificates] = await Promise.all([
    getProjects(), getHackathons(), getStartups(), getCertificates(),
  ]);

  const projectLines = projects.map((p) =>
    `${p.name} (${p.status}${p.progress ? `, ${p.progress}% done` : ''}): ${p.description || 'no description'}${p.repo_url ? ` — repo: ${p.repo_url}` : ''}${p.site_url ? ` — live: ${p.site_url}` : ''}`
  );

  const hackathonLines = hackathons.map((h) =>
    `${h.name}${h.project_name ? ` — built "${h.project_name}"` : ''} (${h.organizer || 'organizer unknown'}, ${h.status}${h.submitted ? ', submitted' : ''})${h.themes ? `, theme: ${h.themes}` : ''}`
  );

  const startupLines = startups.map((s) => `${s.name}: ${s.description || 'no description'}`);

  const certLines = certificates.map((c) =>
    `${c.title} (${c.category || 'certificate'})${c.date_earned ? `, earned ${c.date_earned}` : ''}${c.achievement ? ` — ${c.achievement}` : ''}${c.description ? `: ${c.description}` : ''}`
  );

  return [
    projectLines.length ? `Projects:\n- ${projectLines.join('\n- ')}` : null,
    hackathonLines.length ? `Hackathons:\n- ${hackathonLines.join('\n- ')}` : null,
    startupLines.length ? `Startup ideas/ventures:\n- ${startupLines.join('\n- ')}` : null,
    certLines.length ? `Certificates:\n- ${certLines.join('\n- ')}` : null,
  ].filter(Boolean).join('\n\n') || null;
}

// The full context string injected as a system message on every Jarvis turn.
export async function buildJarvisContext() {
  const [money, planner, meals, deadlines, career] = await Promise.all([
    summarizeMoney().catch((e) => `(money data unavailable: ${e.message})`),
    summarizePlanner().catch((e) => `(planner data unavailable: ${e.message})`),
    summarizeMeals().catch((e) => `(meal data unavailable: ${e.message})`),
    summarizeDeadlines().catch(() => null),
    summarizeCareer().catch(() => null),
  ]);

  const now = new Date();
  return [
    `Current date/time: ${now.toLocaleString()}`,
    `— MONEY —\n${money}`,
    `— TODAY'S PLANNER —\n${planner}`,
    `— MEALS TODAY —\n${meals}`,
    deadlines ? `— DEADLINES —\n${deadlines}` : null,
    career ? `— PROJECTS, HACKATHONS & CERTIFICATES (for CV drafting, feature ideas) —\n${career}` : null,
  ].filter(Boolean).join('\n\n');
}
