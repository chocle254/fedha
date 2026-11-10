import { requireUser } from '../../../lib/require-user';
import { aiJSON } from '../../../lib/ai-json';

// Customers tab → "Where to find them": for THIS startup, who the first customers are, the exact places online
// and offline where those people already gather, what to type into each place's search, a first message, and
// three things to do today. The AI only writes the search words; Luxe builds every link itself from them
// (components/startup/LeadFinder.js), so no link is ever made up.
const KINDS = ['linkedin', 'facebook_groups', 'x', 'reddit', 'google', 'maps', 'instagram', 'telegram', 'tiktok', 'youtube', 'events', 'in_person'];
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const s = req.body?.startup || {};
  if (!clip(s.name, 80) && !clip(s.problem, 80)) return res.status(400).json({ error: 'Fill in what the startup does first (Journey → Ideation).' });
  const where = clip(req.body?.where, 80) || 'Kenya';

  const o = await aiJSON(`You help a solo, first-time founder who is shy about selling find their FIRST paying customers. They build with AI on a phone, have almost no budget, and are based in ${where}.

THE STARTUP
Name: ${clip(s.name, 80)}
What it is: ${clip(s.mission, 400)}
Problem: ${clip(s.problem, 500)}
Solution: ${clip(s.solution, 500)}
Who it is for (their words): ${clip(s.customer, 300) || 'not written yet'}
Stage: ${clip(s.stage, 40)}. People already in their pipeline: ${Number(s.pipeline) || 0}. Paying: ${Number(s.paying) || 0}.
Price: ${clip(s.price, 120) || 'not set'}

Work out where the people who have this problem ALREADY spend time, and how to reach them without a budget. Be specific to this problem and to ${where}: name the kind of group, job title, shop, office, school or event. Prefer places where one message reaches many of the right people, and ways that suit someone shy (writing first, not cold calls).

Return JSON:
{"who":"the first customers in one or two plain sentences: who exactly, and the moment they feel the problem",
 "places":[{"kind":"one of ${KINDS.join(' | ')}","label":"the place, e.g. 'Facebook groups for boda boda owners'","search":"the exact words to type into that place's search (3-7 words, no quotes, no site: operators; for maps: the kind of business plus the town)","why":"why the right people are there, one line","do":"what to do there first, one line (join, read, reply helpfully, then message)"}],
 "opener":"a first message to send one of these people: under 60 words, about THEIR problem, asks one question, no pitch, no link, plain English",
 "today":["three small concrete things to do today, each doable in under 30 minutes, the first one the easiest"],
 "avoid":"one common mistake to avoid when looking for these customers"}
Give 7-9 places, using at least five different kinds, the most promising first. "in_person" is for a physical place to go; its search is the place type and town.`, { maxTokens: 1800, temperature: 0.5, timeout: 40000 });

  const places = (Array.isArray(o?.places) ? o.places : []).filter((p) => p && KINDS.includes(p.kind) && clip(p.search, 120))
    .slice(0, 9).map((p) => ({ kind: p.kind, label: clip(p.label, 90), search: clip(p.search, 120).replace(/["']/g, ''), why: clip(p.why, 180), do: clip(p.do, 180) }));
  if (!places.length) return res.status(502).json({ error: 'Could not work it out just now. Try again in a minute.' });
  return res.status(200).json({
    who: clip(o.who, 320), places, opener: clip(o.opener, 500),
    today: (Array.isArray(o.today) ? o.today : []).map((x) => clip(x, 200)).filter(Boolean).slice(0, 3),
    avoid: clip(o.avoid, 240), where, at: new Date().toISOString(),
  });
}
