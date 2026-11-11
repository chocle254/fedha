import { requireUser } from '../../lib/require-user';
import { webSearchMulti } from '../../lib/web-search';
import { aiJSON } from '../../lib/ai-json';

// Live a little (pages/living.js). Two jobs, both grounded in a live web search of your town so no place or
// price is made up:
//   find     "I have never had pizza": what it is, where it is sold near you, about what it costs, how to order.
//   day_out  a whole day out by yourself, inside a budget, when you are in the mood to get out.
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const search = async (queries) => { try { return clip((await webSearchMulti(queries, { limitEach: 6 })).text, 7000); } catch { return ''; } };

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const b = req.body || {};
  const city = clip(b.city, 60) || 'Nairobi';

  if (b.type === 'find') {
    const thing = clip(b.thing, 60);
    if (!thing) return res.status(400).json({ error: 'What do you want to try?' });
    const found = await search([`${thing} in ${city} Kenya where to get price`, `best ${thing} ${city} Kenya menu prices KSh`, `${thing} delivery ${city} Kenya`]);
    const o = await aiJSON(`Someone in ${city}, Kenya has NEVER had or done "${thing}" and wants to try it for the first time. They are in their early twenties, on a modest budget, usually go alone, and can feel shy walking into a new place.

WEB SEARCH RESULTS (the ONLY source for place names and prices; never invent either):
${found || '(no results came back)'}

Return JSON:
{"what":"what it is and what to expect the first time, 1-2 plain sentences",
 "places":[{"name":"a real place from the results","area":"part of town","price":"the price or price range the results give, or 'not stated'","note":"one useful line (delivery, good for one person, busy times)"}],
 "expect_to_pay":"an honest sentence on what one person should expect to pay, using only prices in the results; say 'the results did not give prices' if they did not",
 "first_time":"how to do it the first time without feeling lost: what to ask for or order, the size for one person, one sentence they can say at the counter",
 "cheaper_way":"a cheaper or easier way to try it (a small size, a weekday offer, delivery, making it at home), or empty"}
Up to 4 places, the best value for one person first. If the results name no place in or near ${city}, return "places": [] and say so in expect_to_pay. Plain English.`, { maxTokens: 1100, temperature: 0.4, timeout: 40000 });
    if (!o) return res.status(502).json({ error: 'Could not look it up just now. Try again in a minute.' });
    return res.status(200).json({
      thing, city, what: clip(o.what, 320), expect_to_pay: clip(o.expect_to_pay, 260), first_time: clip(o.first_time, 360), cheaper_way: clip(o.cheaper_way, 260),
      places: (Array.isArray(o.places) ? o.places : []).filter((p) => p && clip(p.name, 80)).slice(0, 4).map((p) => ({ name: clip(p.name, 80), area: clip(p.area, 60), price: clip(p.price, 80), note: clip(p.note, 160) })),
      searched: !!found, at: new Date().toISOString(),
    });
  }

  if (b.type === 'day_out') {
    const budget = Math.max(0, Math.round(Number(b.budget) || 0));
    const mood = clip(b.mood, 100);
    const day = clip(b.day, 12) || 'today';
    const found = await search([`things to do alone in ${city} Kenya`, `${city} Kenya cafe restaurant park viewpoint museum cinema arcade`, `${city} events ${day} this week`, `${city} Kenya entry fee prices attractions`]);
    const o = await aiJSON(`Plan a day out ${day} for ONE person in ${city}, Kenya, going by themselves. Early twenties, an introvert who works alone on a phone all week, likes tech, good food, music, series, walking, and wants a day that feels alive without needing company. Total budget: KSh ${budget} (transport, food and everything included).${mood ? ` Mood they asked for: ${mood}.` : ''}${b.weather ? ` Weather: ${clip(b.weather, 120)}.` : ''}

WEB SEARCH RESULTS (the ONLY source for named places; never invent a place or a price):
${found || '(no results came back)'}

Return JSON:
{"title":"a short name for the day",
 "stops":[{"time":"HH:MM 24-hour","what":"what to do there, specific","place":"a real place from the results, or a generic one clearly worded as generic (e.g. 'a quiet cafe near the stage')","cost":0,"solo":"why this is comfortable alone, or what to do with your hands and eyes there"}],
 "eat":"what to eat and roughly what it costs, from the results if they say",
 "bring":["3-5 things to take"],
 "if_it_rains":"the indoor swap for the outdoor part",
 "one_new_thing":"one small new thing to try today that you would not normally do"}
4 to 6 stops from late morning to early evening, home before dark unless the mood says otherwise. Costs are whole KSh numbers per stop including getting there, and together must not pass ${budget}. Mix one thing for the body (a walk, a view), one for the mind (something to see or learn), one treat (food or a drink). Plain English.`, { maxTokens: 1400, temperature: 0.6, timeout: 40000 });
    if (!o) return res.status(502).json({ error: 'Could not plan it just now. Try again in a minute.' });
    let stops = (Array.isArray(o.stops) ? o.stops : []).filter((s) => /^\d{1,2}:\d{2}$/.test(String(s?.time || '')) && clip(s.what, 20)).slice(0, 6)
      .map((s) => ({ time: s.time, what: clip(s.what, 160), place: clip(s.place, 90), cost: Math.max(0, Math.round(Number(s.cost) || 0)), solo: clip(s.solo, 180) }));
    // The day must fit the money: the last stops go first if it does not.
    while (stops.length > 2 && stops.reduce((t, s) => t + s.cost, 0) > budget) stops = stops.slice(0, -1);
    return res.status(200).json({
      city, budget, title: clip(o.title, 60), stops, total: stops.reduce((t, s) => t + s.cost, 0),
      eat: clip(o.eat, 240), bring: (Array.isArray(o.bring) ? o.bring : []).map((x) => clip(x, 60)).filter(Boolean).slice(0, 5),
      if_it_rains: clip(o.if_it_rains, 200), one_new_thing: clip(o.one_new_thing, 200), searched: !!found, at: new Date().toISOString(),
    });
  }
  return res.status(400).json({ error: 'Unknown request' });
}
