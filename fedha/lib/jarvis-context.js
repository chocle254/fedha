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
  getGoals, getSetting, getFoodLogs, getHackathons, getProjects, getCertificates, getStartups, getResearch,
} from './db';
import { todayISO, countdownTo, formatShort } from './utils';
import { detectJarvisRole, detectJarvisSituation, getJarvisRoleGuidance } from './jarvis-intelligence';

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

  const activeLoanRecords = loans.filter((l) => l.status === 'active');
  const activeLoans = activeLoanRecords.map((l) => {
    const due = l.due_date ? ` due ${l.due_date} (${fmtCountdown(l.due_date)})` : '';
    const direction = l.type === 'borrowed' ? 'You owe' : 'Owed to you by';
    return `${direction} ${l.contact_name}: ${formatShort(Number(l.remaining || l.amount))}${due}`;
  });
  // Keep the complete live loan records in the context as well as the
  // human-readable summary. The summary is convenient for normal answers,
  // but the raw records are authoritative: Jarvis must not invent a loan
  // name, balance, rate, term, or any other field that is not actually stored.
  const loanRecordLines = activeLoanRecords.map((l) => JSON.stringify(l));

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
    activeLoans.length
      ? `Active loans (human-readable):\n- ${activeLoans.join('\n- ')}\n\nAUTHORITATIVE LIVE LOAN RECORDS — use these exact stored values. Do not invent, rename, combine, or estimate any loan field:\n${loanRecordLines.join('\n')}`
      : 'No active loans are currently stored in Fedha.',
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
  const [logs, profile, calorieGoal, proteinGoal] = await Promise.all([
    getFoodLogs(todayISO()),
    getSetting('food_profile', { preferences: {}, mealPreferences: {}, prices: {}, customFoods: [] }),
    getSetting('calorie_goal', 2800),
    getSetting('protein_goal', 120),
  ]);

  const totalCal = (logs || []).reduce((s, l) => s + (Number(l.cal) || 0) * (Number(l.qty) || 1), 0);
  const totalProtein = (logs || []).reduce((s, l) => s + (Number(l.protein) || 0) * (Number(l.qty) || 1), 0);
  const remainingCal = Math.max(0, Number(calorieGoal) - totalCal);
  const remainingProtein = Math.max(0, Number(proteinGoal) - totalProtein);
  const items = (logs || []).map((l) => `${l.slot || 'meal'}: ${l.name} (${l.cal || '?'} cal${l.protein != null ? `, ${l.protein}g protein` : ''}${l.qty > 1 ? ` x${l.qty}` : ''})`);
  const likedFoods = Object.entries(profile?.preferences || {}).filter(([, p]) => p?.state === 'liked').map(([id]) => id).slice(0, 12);
  const dislikedFoods = Object.entries(profile?.preferences || {}).filter(([, p]) => p?.state === 'disliked').map(([id]) => id).slice(0, 12);
  const likedMeals = Object.entries(profile?.mealPreferences || {}).filter(([, p]) => p?.state === 'liked').map(([id]) => id).slice(0, 8);
  return [
    items.length ? `Today's meals logged (${Math.round(totalCal)} cal, ${Math.round(totalProtein)}g protein):\n- ${items.join('\n- ')}` : 'No meals logged today yet.',
    `Nutrition remaining today: about ${Math.round(remainingCal)} cal and ${Math.round(remainingProtein)}g protein against the current Food goals.`,
    likedFoods.length ? `Foods the user personally likes: ${likedFoods.join(', ')}` : 'No food likes recorded yet.',
    dislikedFoods.length ? `Foods the user personally dislikes: ${dislikedFoods.join(', ')} — avoid suggesting these.` : null,
    likedMeals.length ? `Meals the user personally likes: ${likedMeals.join(', ')}` : null,
    'Food suggestion rule: when suggesting a meal, consider the user’s existing Floating Balance, known personal food prices, remaining nutrition targets, and personal likes/dislikes. Never invent a price; if price is unknown, say so.',
  ].filter(Boolean).join('\n');
}

async function summarizeGoals() {
  const goals = await getGoals();
  if (!goals.length) return 'No goals have been recorded yet.';
  return goals.map((g) => {
    const target = Number(g.target);
    const current = Number(g.current || 0);
    const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : null;
    const status = g.completed || g.status === 'completed' || (pct !== null && pct >= 100) ? 'completed' : (g.status || 'active');
    const deadline = g.deadline || g.target_date || g.due_date;
    return `${g.name || 'Unnamed goal'}: ${status}${pct !== null ? `, ${pct}% (${current}/${target})` : ''}${deadline ? `, deadline ${deadline}` : ''}`;
  }).join('\\n');
}

async function summarizeDeadlines() {
  const hackathons = await getHackathons();
  const upcoming = hackathons
    .filter((h) => h.deadline && !countdownTo(h.deadline)?.past)
    .map((h) => `${h.name}: deadline ${h.deadline} (${fmtCountdown(h.deadline)})`);
  return upcoming.length ? `Upcoming hackathon/project deadlines:\n- ${upcoming.join('\n- ')}` : null;
}

// Open (not-yet-wrapped-up) research entries — surfaced so Jarvis and the
// planner's AI day-generator both know when there's something worth a
// dedicated research block, without either duplicating this query.
async function summarizeResearch() {
  const research = await getResearch();
  const open = research.filter((r) => r.status !== 'closed');
  if (!open.length) return null;
  const lines = open.map((r) => `${r.title} (${r.category})${r.entries?.length ? ` — ${r.entries.length} search${r.entries.length === 1 ? '' : 'es'} logged so far` : ' — not started yet'}${r.notes ? `: ${r.notes}` : ''}`);
  return `Open research items (not yet wrapped up):\n- ${lines.join('\n- ')}`;
}

// Full career/portfolio picture — used for CV drafting and feature-idea
// suggestions, grounded in the user's actual Fedha records.
async function summarizeCareer(message = '') {
  const [projects, hackathons, startups, certificates] = await Promise.all([
    getProjects(), getHackathons(), getStartups(), getCertificates(),
  ]);
  const q = String(message || '').toLowerCase();

  const projectLines = projects.map((p) => {
    const meta = [
      p.status || 'unknown',
      p.progress != null ? p.progress + '% done' : null,
      p.importance != null ? 'importance ' + p.importance + '%' : null,
    ].filter(Boolean).join(', ');
    return p.name + ' (' + meta + '): ' + (p.description || 'no description') +
      (p.repo_url ? ' — repo: ' + p.repo_url : '') +
      (p.site_url ? ' — live: ' + p.site_url : '');
  });

  const hackathonLines = hackathons.map((h) => {
    const meta = [
      h.organizer || 'organizer unknown',
      h.status || 'unknown',
      h.submitted ? 'submitted' : null,
      h.deadline ? 'deadline ' + h.deadline + (fmtCountdown(h.deadline) ? ' (' + fmtCountdown(h.deadline) + ')' : '') : null,
      h.themes ? 'themes: ' + h.themes : null,
    ].filter(Boolean).join(', ');
    return h.name + (h.project_name ? ' — project "' + h.project_name + '"' : '') + ' (' + meta + ')';
  });

  const certLines = certificates.map((c) =>
    c.title + ' (' + (c.category || 'certificate') + ')' +
    (c.date_earned ? ', earned ' + c.date_earned : '') +
    (c.achievement ? ' — ' + c.achievement : '') +
    (c.description ? ': ' + c.description : '')
  );

  const mentioned = startups.filter((st) => st.name && q.includes(String(st.name).toLowerCase()));
  const genericStartup = /\b(my startup|the startup|my venture|the venture|startup of mine)\b/.test(q);
  const startupTargets = mentioned.length ? mentioned : (startups.length === 1 || genericStartup ? startups : []);

  const startupLines = startupTargets.map((st) => {
    const stages = st.stages || {};
    const stageLabels = {
      ideation: ['problem','solution','project','validation'],
      prototyping: ['tech_stack','key_features','prototype_link','learnings'],
      mvp: ['launch_status','target_users','metrics','next_steps'],
      pmf: ['retention_metrics','user_feedback','product_changes','market_fit_signals'],
      growth: ['marketing_strategy','team_size','partnerships','growth_metrics'],
      revenue: ['revenue_model','pricing_strategy','current_arr','unit_economics'],
      expansion: ['new_markets','new_features','localization','expansion_timeline'],
      exit: ['exit_strategy','acquisition_targets','valuation','long_term_vision'],
    };
    const details = [];
    Object.entries(stageLabels).forEach(([stage, fields]) => {
      fields.forEach((field) => {
        const value = stages[stage] && stages[stage][field];
        if (value !== undefined && value !== null && String(value).trim()) {
          details.push(stage + ' / ' + field + ': ' + String(value));
        }
      });
    });
    return st.name + ': ' + (st.description || 'no description') +
      (details.length ? '\n' + details.join('\n') : '\nNo startup stage details recorded yet.');
  });

  const result = [
    projectLines.length ? 'Projects:\n- ' + projectLines.join('\n- ') : null,
    hackathonLines.length ? 'Hackathons:\n- ' + hackathonLines.join('\n- ') : null,
    startupLines.length ? 'Detailed startup context from Fedha (authoritative):\n- ' + startupLines.join('\n- ') :
      (startups.length ? 'Startups: ' + startups.map((st) => st.name).join(', ') : null),
    certLines.length ? 'Certificates:\n- ' + certLines.join('\n- ') : null,
  ].filter(Boolean).join('\n\n');

  return result ? (result.length > 9000 ? result.slice(0, 9000) + '\n[portfolio context truncated]' : result) : null;
}

// The full context string injected as a system message on every Jarvis turn.
export async function buildJarvisContext(message = '') {
  const m = String(message || '').toLowerCase();
  const wantsMoney = /\b(money|cash|balance|wallet|budget|expense|spent|spend|transaction|income|salary|loan|owe|owed|saving|savings|financial|afford|price|cost)\b/.test(m);
  const wantsPlanner = /\b(planner|schedule|plan|today|tomorrow|task|tasks|block|time|busy|free|deadline)\b/.test(m);
  const wantsMeals = /\b(food|eat|eating|meal|breakfast|lunch|dinner|snack|calorie|protein|nutrition|hungry)\b/.test(m);
  // Career context must activate not only for generic words like "project" or
  // "startup", but also when the user names an actual record stored in Fedha
  // (for example, "CivCare"). This keeps named-record questions grounded in
  // live data instead of relying on hard-coded keywords.
  let mentionedRecord = false;
  try {
    const [projectRecords, startupRecords, hackathonRecords, certificateRecords] = await Promise.all([
      getProjects(), getStartups(), getHackathons(), getCertificates(),
    ]);
    const records = [...projectRecords, ...startupRecords, ...hackathonRecords, ...certificateRecords];
    const normalize = (value) => String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const normalizedMessage = normalize(message);
    mentionedRecord = records.some((record) => {
      const name = normalize(record.name || record.title);
      return name && normalizedMessage.includes(name);
    });
  } catch {
    // Keep the rest of context working if the lightweight lookup fails.
  }
  const wantsCareer = /\b(cv|resume|project|projects|hackathon|startup|certificate|portfolio|career|job|venture|event)\b/.test(m) || mentionedRecord;
  const wantsResearch = /\b(research|gig|side hustle|online job|food near|restaurant|cafe|activity|activities)\b/.test(m);
  const wantsGoals = /\b(goal|goals|achieve|achievement|milestone|progress|target|life goal)\b/.test(m);
  const role = detectJarvisRole(message);
  const situation = detectJarvisSituation(message);
  const [money, planner, meals, deadlines, career, research, goals] = await Promise.all([
    wantsMoney ? summarizeMoney().catch((e) => `(money data unavailable: ${e.message})`) : Promise.resolve(null),
    wantsPlanner ? summarizePlanner().catch((e) => `(planner data unavailable: ${e.message})`) : Promise.resolve(null),
    wantsMeals ? summarizeMeals().catch((e) => `(meal data unavailable: ${e.message})`) : Promise.resolve(null),
    (wantsPlanner || wantsCareer) ? summarizeDeadlines().catch(() => null) : Promise.resolve(null),
    wantsCareer ? summarizeCareer(message).catch(() => null) : Promise.resolve(null),
    wantsResearch ? summarizeResearch().catch(() => null) : Promise.resolve(null),
    wantsGoals ? summarizeGoals().catch(() => null) : Promise.resolve(null),
  ]);

  const now = new Date();
  return [
    `Current date/time: ${now.toLocaleString()}`,
    `— JARVIS MODE —\nRole: ${role}. ${getJarvisRoleGuidance(role, situation)}\nSituation: ${situation}.`,
    money ? `— MONEY —\n${money}` : null,
    planner ? `— TODAY'S PLANNER —\n${planner}` : null,
    meals ? `— MEALS TODAY —\n${meals}` : null,
    deadlines ? `— DEADLINES —\n${deadlines}` : null,
    research ? `— RESEARCH —\n${research}` : null,
    goals ? `— GOALS & PROGRESS —\n${goals}` : null,
    career ? `— PROJECTS, HACKATHONS & STARTUPS —\n${career}` : null,
  ].filter(Boolean).join('\n\n');
}
