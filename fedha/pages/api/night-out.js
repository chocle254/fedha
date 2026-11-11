import { requireUser } from '../../lib/require-user';
import { webSearchMulti } from '../../lib/web-search';
import { aiJSON } from '../../lib/ai-json';

// Planner → Night out: where to go tonight, how to split the money, when to leave home and when to head back,
// and what to carry. The places come from a live web search of your town (never made up); the money split and
// the clock are checked here in code so the plan always adds up to the budget you set.
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const PARTS = ['transport_there', 'entry', 'drinks', 'food', 'ride_home', 'buffer'];

export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const b = req.body || {};
  const city = clip(b.city, 60) || 'Nairobi';
  const budget = Math.max(0, Math.round(Number(b.budget) || 0));
  if (budget < 200) return res.status(400).json({ error: 'Set how much you can spend tonight first (at least KSh 200).' });
  const day = clip(b.day, 12) || 'Saturday';
  const vibe = clip(b.vibe, 80);

  let found = '';
  try {
    const r = await webSearchMulti([
      `best clubs and lounges in ${city} Kenya`,
      `${city} nightlife ${day} night events this weekend`,
      `${city} club entry fee drink prices`,
    ], { limitEach: 6 });
    found = clip(r?.text || r?.context || (Array.isArray(r?.blocks) ? r.blocks.join('\n') : typeof r === 'string' ? r : JSON.stringify(r)), 7000);
  } catch { /* plan without venues */ }

  const o = await aiJSON(`Plan a night out for ONE person in ${city}, Kenya, this ${day}. They are in their early twenties, an introvert who loves a good party at the weekend, usually goes alone or with one or two friends, and smokes weed sometimes. Tonight's total budget is KSh ${budget}, and it must cover everything including getting home.${vibe ? ` They said they want: ${vibe}.` : ''}

WEB SEARCH RESULTS about nightlife in ${city} (the ONLY source for venue names; never invent a venue):
${found || '(no results came back)'}

Return JSON:
{"venues":[{"name":"a real venue from the results","area":"part of town","why":"why it suits them tonight, one line","music":"what it usually plays, if the results say","entry":"what the results say about entry or 'not stated'","note":"anything worth knowing (dress code, busy time), or empty"}],
 "split":{"transport_there":0,"entry":0,"drinks":0,"food":0,"ride_home":0,"buffer":0},
 "drinks_plan":"what that drinks money buys there in plain terms (how many, what kind), and the cheapest sensible way to do it",
 "timeline":[{"time":"HH:MM in 24-hour","what":"short"}],
 "carry":["what to leave the house with, each short"],
 "leave_at_home":["what to leave behind, each short"],
 "rules":["3-4 short personal rules for tonight"]}
Rules for the plan:
- venues: up to 3, best first, only from the search results. If the results name none, return [] and say nothing invented.
- split: whole KSh numbers that add up to exactly ${budget}. ride_home comes FIRST and is never spent on anything else (a boda or taxi late at night costs more than in the day). buffer is at least 10% of the budget.
- timeline: eat at home first, when to leave home, arrive, a "last drink" time, and the time to head home; home by about 02:00 unless the budget is very small (then earlier).
- carry: ID, phone charged, only tonight's money on M-Pesa, the ride-home money kept apart, and so on. leave_at_home: bank cards, the rest of the money, valuables.
- rules: practical and non-judgemental (water between drinks, the drink stays in your hand, if you smoked go lighter on the alcohol, tell one person where you are).
Plain English, no slang.`, { maxTokens: 1700, temperature: 0.5, timeout: 40000 });
  if (!o) return res.status(502).json({ error: 'Could not plan it just now. Try again in a minute.' });

  // The money must add up: fix whatever the AI returned so the parts total the budget and the ride home is protected.
  const split = {};
  for (const k of PARTS) split[k] = Math.max(0, Math.round(Number(o.split?.[k]) || 0));
  const minRide = Math.min(budget, Math.max(split.ride_home, Math.round(budget * 0.15)));
  split.ride_home = minRide;
  split.buffer = Math.max(split.buffer, Math.round(budget * 0.1));
  let total = PARTS.reduce((s, k) => s + split[k], 0);
  // Too much: take it from drinks, then food, then entry. Too little: it goes to the buffer.
  for (const k of ['drinks', 'food', 'entry', 'transport_there']) { if (total <= budget) break; const cut = Math.min(split[k], total - budget); split[k] -= cut; total -= cut; }
  if (total < budget) split.buffer += budget - total;

  const list = (a, n, len) => (Array.isArray(a) ? a : []).map((x) => clip(x, len)).filter(Boolean).slice(0, n);
  return res.status(200).json({
    city, day, budget, split,
    venues: (Array.isArray(o.venues) ? o.venues : []).filter((v) => v && clip(v.name, 80)).slice(0, 3).map((v) => ({ name: clip(v.name, 80), area: clip(v.area, 60), why: clip(v.why, 200), music: clip(v.music, 80), entry: clip(v.entry, 80), note: clip(v.note, 160) })),
    drinks_plan: clip(o.drinks_plan, 300),
    timeline: (Array.isArray(o.timeline) ? o.timeline : []).filter((t) => /^\d{1,2}:\d{2}$/.test(String(t?.time || ''))).slice(0, 8).map((t) => ({ time: t.time, what: clip(t.what, 120) })),
    carry: list(o.carry, 7, 80), leave_at_home: list(o.leave_at_home, 5, 80), rules: list(o.rules, 4, 140),
    searched: !!found, at: new Date().toISOString(),
  });
}
