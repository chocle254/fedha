import { requireUser } from '../../../lib/require-user';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { nvidiaChat } from '../../../lib/nvidia-client';
import { organise } from '../../../lib/chill-names';
import { tasteSignals } from '../../../lib/chill-taste';
import { WATCH_SEASONS } from '../../../lib/chill-seasons';
import { look } from '../../../lib/chill-lookup';

// GET /api/chill/season?key=christmas : a holiday row for the Chill Room (🎃 Halloween, 🎄 Christmas, 🎆 New Year,
// 💝 Valentine's, 🐣 Easter), picked for your taste from what you loved, binged and want. Nothing you already have
// or reacted to. The phone keeps the answer for the season (lib/chill.js); nothing is stored here.
const get = async (uid, key) => (await supabaseAdmin.from('settings').select('value').eq('user_id', uid).eq('key', key).maybeSingle()).data?.value || null;
function parseJSON(text) {
  const s = String(text || ''); const a = s.indexOf('{'); const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = await requireUser(req, res);
  if (!user) return;
  const season = WATCH_SEASONS.find((s) => s.key === req.query.key);
  if (!season) return res.status(400).json({ items: [] });
  const [lib, room] = await Promise.all([get(user.id, 'chill_library'), get(user.id, 'chill_room')]);
  const { shows, movies } = organise(lib?.files || []);
  const fb = room?.feedback || {};
  const sig = tasteSignals({ shows, movies, prog: room || {} });
  const loved = Object.keys(fb).filter((t) => fb[t] === 'loved');
  const enjoyed = Object.keys(sig).filter((t) => sig[t] >= 1 && fb[t] !== 'loved');
  const avoid = Object.keys(sig).filter((t) => sig[t] < 0);
  const skip = [...shows.map((s) => s.title), ...movies.map((m) => m.title), ...Object.keys(fb)];

  const prompt = `Pick a ${season.name} watch list for one person (25, Kenya, watches in the evening, relaxed).
Theme: ${season.theme}.
Their taste: loved ${loved.join(', ') || 'nothing marked yet'}; enjoyed or want to watch ${enjoyed.join(', ') || 'nothing yet'}; not their thing ${avoid.join(', ') || 'nothing'}.
Suggest 14 titles that fit the ${season.name} theme AND their taste: about 8 movies and 6 series (series can be a single holiday special or a season with a holiday episode run), including 2-3 animated if they fit (set "animation": true). Mix classics with recent ones. Do NOT suggest any of these: ${skip.join(', ') || 'none'}. Real titles only, exact official title and first-release year.
Return JSON only: {"items":[{"title":"...","type":"series"|"movie","animation":false,"year":2008,"why":"one short sentence: why it's a ${season.name} watch for them, no spoilers"}]}`;
  try {
    const out = await nvidiaChat({ prompt, system: 'You output only valid JSON. No markdown, no commentary.', temperature: 0.6, maxTokens: 1800 });
    const no = new Set(skip.map((t) => t.toLowerCase()));
    const want = (parseJSON(out)?.items || []).filter((x) => x?.title && !no.has(String(x.title).toLowerCase())).slice(0, 14)
      .map((x) => ({ title: String(x.title).slice(0, 80), type: x.type === 'movie' ? 'movie' : 'series', animation: !!x.animation, year: Number(x.year) || null, why: String(x.why || '').slice(0, 200), season: season.key }));
    const items = await Promise.all(want.map(async (x) => ({ ...x, ...(await look(x)) })));
    return res.status(200).json({ key: season.key, items });
  } catch {
    return res.status(200).json({ key: season.key, items: [], error: 'The AI is busy right now. Try again in a minute.' });
  }
}
