// pages/api/review-coach.js — reads your last two weeks of Daily Reviews (pages/review.js) and says, plainly, what
// the pattern is and what to change in tomorrow's plan. Honest, not flattering: it quotes your own numbers and
// words, and if a habit keeps costing you days it says so. Called only when you tap the button (no polling).
import { requireUser } from '../../lib/require-user';
import { aiJSON } from '../../lib/ai-json';

export const config = { maxDuration: 30 };

const clip = (s, n = 300) => String(s || '').slice(0, n);

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const reviews = (Array.isArray(req.body?.reviews) ? req.body.reviews : []).slice(-14);
  if (reviews.length < 2) return res.status(400).json({ error: 'Write at least two reviews first.' });

  const lines = reviews.map((r) => [
    `${r.date} (${r.weekday || ''})`,
    `score ${r.score ?? '?'}/10, energy ${r.energy || '?'}`,
    r.planDone != null ? `planner blocks ticked ${r.planDone}${r.three ? ', the three that count: all done' : ''}` : '',
    r.moneyIn ? `money in KSh ${r.moneyIn}` : 'no money in',
    r.lastPromise ? `yesterday's "do differently" kept: ${r.lastPromise}` : '',
    r.topDone != null ? `yesterday's top 3 done: ${r.topDone}/${r.topCount || 3}` : '',
    `wins: ${clip(r.wins)}`,
    `learned: ${clip(r.learned)}`,
    `got in the way: ${(r.blockers || []).join(', ')}${r.blockerNote ? ` (${clip(r.blockerNote, 200)})` : ''}`,
    `do differently: ${clip(r.differently)}`,
    `tomorrow's top 3: ${(r.top3 || []).filter(Boolean).map((x) => clip(x, 80)).join(' | ')}`,
  ].filter(Boolean).join('; ')).join('\n');

  const prompt = `You are the planning coach inside Luxe, a personal app for a young freelancer and builder in Kenya who wants to get rich through work, client projects, startups and trading. Below are their own end-of-day reviews (newest last). Read them like a coach who measures and corrects: honest and specific, never flattering, never preachy. Plain English, no slang. Quote their numbers and their own words as evidence. Big ambitions are good; never talk them down, show them the next concrete step.

If anything they wrote suggests thoughts of self-harm or suicide, set "care" to one short warm sentence pointing them to Befrienders Kenya on 0722 178 177 and Luxe's "When it's heavy" page; otherwise "care" is "".

REVIEWS:
${lines}

Return JSON:
{
  "headline": "one sentence: the honest read of the last ${reviews.length} days",
  "trend": "one sentence on whether the day scores are going up, down or flat, with the numbers",
  "patterns": ["2-4 patterns you can actually see in the data, each with the evidence (dates, counts, their words)"],
  "costly": "the one thing that cost them the most days, and how often, or \\"\\" if nothing stands out",
  "plan_changes": ["2-3 concrete changes to make to tomorrow's plan in the Luxe planner (a time, a block, a rule), each one short"],
  "keep": "one thing that is clearly working and should stay",
  "question": "one sharp question for tonight's review that would teach them the most",
  "care": ""
}`;

  const out = await aiJSON(prompt, { maxTokens: 1400, temperature: 0.3, timeout: 25000 });
  if (!out) return res.status(503).json({ error: 'The AI is busy right now. Try again in a minute.' });
  return res.status(200).json({ insight: { ...out, at: new Date().toISOString(), days: reviews.length } });
}
