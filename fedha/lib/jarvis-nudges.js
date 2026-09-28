// Proactive nudges: Jarvis noticing something without being asked.
//
// Detection for most conditions (loan/income due dates) already lives in
// _app.js's existing, well-tested alert logic — this module adds the one
// nudge type nothing else watches for (budget overspending), and provides
// fireJarvisNudge() as the shared phrase-and-deliver step so every nudge,
// regardless of where it's detected, sounds like Jarvis noticing something
// in its own voice rather than a templated system alert.
//
// Every nudge is deduped per day via a settings key (getSetting/setSetting)
// so re-running this on every app load doesn't repeat the same nudge.

import { getBudgets, getSetting, setSetting, appendJarvisMessage, getFoodLogs } from './db';
import { todayISO, formatShort } from './utils';
import { showNotif, VIBRATE } from './notifications';

const OVERSPEND_THRESHOLD = 0.9; // nudge once a budget crosses 90% spent

async function phraseNudge(situation) {
  try {
    const res = await fetch('/api/jarvis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `(This is an internal system trigger, not something the user typed.) Write ONE short, natural nudge — a sentence or two, like you just noticed this and want to mention it. Situation: ${situation}`,
        context: '',
        memory: '',
        history: [],
      }),
    });
    const data = await res.json();
    return data.reply || situation;
  } catch {
    return situation; // fall back to the plain rule-based description if the API call fails
  }
}

async function alreadyNudgedToday(key) {
  const done = await getSetting(`jarvis_nudged_${todayISO()}`, []);
  return done.includes(key);
}
async function markNudged(key) {
  const done = await getSetting(`jarvis_nudged_${todayISO()}`, []);
  if (!done.includes(key)) await setSetting(`jarvis_nudged_${todayISO()}`, [...done, key]);
}

// Asks Jarvis to phrase a nudge for the given situation and delivers it —
// as a local notification and as a message appended to the Jarvis chat log
// (so opening the widget later shows Jarvis having said it, not just a
// notification that vanished). Deduped per key per day. Exported so
// _app.js's own due-date detection (loans, income plans — it already has
// a well-tested detection window for these) can reuse the phrasing/
// delivery half without duplicating it.
export async function fireJarvisNudge(key, situation) {
  if (await alreadyNudgedToday(key)) return;
  const text = await phraseNudge(situation);
  await appendJarvisMessage('assistant', text);
  await showNotif({ title: '🤖 Jarvis', body: text, tag: `jarvis_${key}`, vibrate: VIBRATE.medium });
  await markNudged(key);
}


// Food: one gentle Jarvis nudge if the day is moving on and no meal has
// been logged. This is deliberately separate from Planner meal reminders:
// it reacts to the actual diary state instead of scheduling an eating time.
export async function checkMealNudges() {
  try {
    const hour = new Date().getHours();
    if (hour < 11) return;

    const logs = await getFoodLogs(todayISO());
    if (logs?.length) return;

    await fireJarvisNudge(
      'food_no_meal',
      'It is already late morning and the user has not logged any meal today. Gently remind them to eat/log their first meal, and if useful suggest a simple meal using their Food preferences, nutrition needs and Floating Balance.'
    );
  } catch (e) {
    console.warn('[fedha] Jarvis meal nudge check failed:', e?.message);
  }
}

// Budget overspending: the one nudge type this module detects itself,
// since nothing else in the app already watches for it. Call this from
// _app.js's scheduler alongside the loan/income due-date checks.
export async function checkBudgetNudges() {
  try {
    const budgets = await getBudgets();
    for (const b of budgets) {
      const pct = b.allocated ? (Number(b.spent || 0) / Number(b.allocated)) : 0;
      if (pct >= OVERSPEND_THRESHOLD) {
        await fireJarvisNudge(
          `budget_${b.id}`,
          `The user's "${b.name}" budget (${b.category}) is at ${Math.round(pct * 100)}% spent — ${formatShort(Number(b.spent))} of ${formatShort(Number(b.allocated))}. Gently flag this.`
        );
      }
    }
  } catch (e) {
    console.warn('[fedha] Jarvis budget nudge check failed:', e?.message);
  }
}
