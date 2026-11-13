import { requireUser } from '../../lib/require-user';
import { webSearchMulti } from '../../lib/web-search';
import { aiJSON } from '../../lib/ai-json';

// Planner → Night out: where to go tonight, how to split the money, when to leave home and when to head back,
// and what to carry. The places come from a live web search of your town (never made up); the money split and
// the clock are checked here in code so the plan always adds up to the budget you set.
import { verifyAll, nearbyNightlife } from '../../lib/osm-places';

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
  // Your own prices from the Night out panel: a full bottle and the fares. These are floors the plan must meet.
  const num = (v, d, max) => Math.max(0, Math.min(max, Math.round(Number(v) || d)));
  const bottle = num(b.bottle, 1500, 20000), fareThere = num(b.fareThere, 300, 5000), fareHome = num(b.fareHome, 600, 5000);
  const floor = bottle + fareThere + fareHome + Math.round(budget * 0.1);
  if (budget < floor) return res.status(400).json({ error: `KSh ${budget} does not cover your bottle (KSh ${bottle}), both fares (KSh ${fareThere + fareHome}) and a buffer. A proper night needs at least KSh ${Math.ceil(floor / 50) * 50}.` });
  const geo = { city, lat: Number.isFinite(Number(b.lat)) && b.lat != null && b.lat !== '' ? Number(b.lat) : null, lon: Number.isFinite(Number(b.lon)) && b.lon != null && b.lon !== '' ? Number(b.lon) : null };

  let found = '';
  try {
    const r = await webSearchMulti([
      `best clubs and lounges in ${city} Kenya`,
      `${city} nightlife ${day} night events this weekend`,
      `${city} club entry fee drink prices`,
    ], { limitEach: 6 });
    found = clip(r?.text || r?.context || (Array.isArray(r?.blocks) ? r.blocks.join('\n') : typeof r === 'string' ? r : JSON.stringify(r)), 7000);
  } catch { /* plan without venues */ }

  const o = await aiJSON(`Plan a night out for ONE person in ${city}, Kenya, this ${day}. They are in their early twenties, an introvert who loves a good party at the weekend, usually goes alone or with one or two friends, and smokes weed sometimes. Tonight is a reward for money they earned. Tonight's total budget is KSh ${budget}, and it must cover everything including getting home.
Their own prices: their drink for the night is a ${clip(b.size, 30) || 'half bottle (350 ml)'} of spirits at about KSh ${bottle}, bought at a shop or supermarket on the way (club prices run 2-3x) — that is the whole night's drink, with mixers and water, the fare there about KSh ${fareThere}, and the fare home late at night about KSh ${fareHome}.
${Number(b.birthday) > 0 ? `TONIGHT IS THEIR ${Math.round(Number(b.birthday))}TH BIRTHDAY: make it feel like a celebration (a place with a good crowd and music, somewhere friends can join, a toast moment), the budget covers a second bottle to share. ` : ''}They want to have real fun and NOT overdo it to the point of forgetting themselves: the plan must pace the bottle over the night.${vibe ? ` They said they want: ${vibe}.` : ''}

WEB SEARCH RESULTS about nightlife in ${city} (the ONLY source for venue names; never invent a venue):
${found || '(no results came back)'}

Return JSON:
{"venues":[{"name":"a real venue from the results","area":"part of town","why":"why it suits them tonight, one line","music":"what it usually plays, if the results say","entry":"what the results say about entry or 'not stated'","note":"anything worth knowing (dress code, busy time), or empty"}],
 "split":{"transport_there":0,"entry":0,"drinks":0,"food":0,"ride_home":0,"buffer":0},
 "drinks_plan":"what that drinks money buys in plain terms: the bottle from the shop, mixers, water, and at most one drink bought inside if the money allows; the cheapest sensible way to do it",
 "timeline":[{"time":"HH:MM in 24-hour","what":"short"}],
 "carry":["what to leave the house with, each short"],
 "leave_at_home":["what to leave behind, each short"],
 "rules":["3-4 short personal rules for tonight"],
 "pace":{"first_drink":"HH:MM","last_drink":"HH:MM","home_by":"HH:MM","rhythm":"2 plain sentences: how to pace the bottle over the night (a mixer every time, a glass of water after each drink, food first, go lighter if they smoked)","stop_signs":["3-4 short signs it is time to stop and order the ride (lost count, wanting to touch the ride money, the room spinning, a stranger pushing drinks)"]}}
Rules for the plan:
- venues: up to 3, best first, only from the search results. If the results name none, return [] and say nothing invented.
- split: whole KSh numbers that add up to exactly ${budget}. ride_home comes FIRST and is never spent on anything else (a boda or taxi late at night costs more than in the day). buffer is at least 10% of the budget.
- split: drinks is at least ${bottle} (the bottle), transport_there at least ${fareThere}, ride_home at least ${fareHome}.
- timeline: eat at home first, when to leave home, arrive, a "last drink" time, and the time to head home; home by about 01:30.
- pace: last_drink about an hour before home_by; first_drink only after eating.
- carry: ID, phone charged, only tonight's money on M-Pesa, the ride-home money kept apart, and so on. leave_at_home: bank cards, the rest of the money, valuables.
- rules: practical and non-judgemental (water between drinks, the drink stays in your hand, alcohol and weed together hit much harder than either alone so on a night out pick one or go very light on both, tell one person where you are).
Plain English, no slang.`, { maxTokens: 1700, temperature: 0.5, timeout: 40000 });
  if (!o) return res.status(502).json({ error: 'Could not plan it just now. Try again in a minute.' });

  // The money must add up: fix whatever the AI returned so the parts total the budget and the ride home is protected.
  const split = {};
  for (const k of PARTS) split[k] = Math.max(0, Math.round(Number(o.split?.[k]) || 0));
  // Floors: the ride home (your night fare, at least 15%), the fare there, the bottle, and a 10% buffer.
  const floors = { ride_home: Math.max(fareHome, Math.round(budget * 0.15)), transport_there: fareThere, drinks: bottle, buffer: Math.round(budget * 0.1), entry: 0, food: 0 };
  for (const k of PARTS) split[k] = Math.max(split[k], floors[k]);
  let total = PARTS.reduce((s, k) => s + split[k], 0);
  // Too much: take it from food, then entry, then drinks and the fare there down to their floors. Too little: buffer.
  for (const k of ['food', 'entry', 'drinks', 'transport_there', 'ride_home']) { if (total <= budget) break; const cut = Math.min(split[k] - floors[k], total - budget); if (cut > 0) { split[k] -= cut; total -= cut; } }
  if (total < budget) split.buffer += budget - total;

  // Only venues the map really has near you; if none check out, clubs and bars straight from the map.
  const named = (Array.isArray(o.venues) ? o.venues : []).filter((v) => v && clip(v.name, 80)).slice(0, 3).map((v) => ({ name: clip(v.name, 80), area: clip(v.area, 60), why: clip(v.why, 200), music: clip(v.music, 80), entry: clip(v.entry, 80), note: clip(v.note, 160) }));
  let venues = (await verifyAll(named, geo)).filter((v) => v.on_map);
  let venues_from = 'search';
  if (!venues.length) { venues = await nearbyNightlife(geo); venues_from = venues.length ? 'map' : 'none'; }
  const list = (a, n, len) => (Array.isArray(a) ? a : []).map((x) => clip(x, len)).filter(Boolean).slice(0, n);
  return res.status(200).json({
    city, lat: geo.lat, lon: geo.lon, day, budget, split,
    venues, venues_from,
    drinks_plan: clip(o.drinks_plan, 300),
    timeline: (Array.isArray(o.timeline) ? o.timeline : []).filter((t) => /^\d{1,2}:\d{2}$/.test(String(t?.time || ''))).slice(0, 8).map((t) => ({ time: t.time, what: clip(t.what, 120) })),
    carry: list(o.carry, 7, 80), leave_at_home: list(o.leave_at_home, 5, 80), rules: list(o.rules, 4, 140),
    pace: o.pace ? { ...Object.fromEntries(['first_drink', 'last_drink', 'home_by'].map((k) => [k, /^\d{1,2}:\d{2}$/.test(String(o.pace[k] || '')) ? o.pace[k] : null])), rhythm: clip(o.pace.rhythm, 300), stop_signs: list(o.pace.stop_signs, 4, 100) } : null,
    prices: { bottle, fareThere, fareHome },
    searched: !!found, at: new Date().toISOString(),
  });
}
