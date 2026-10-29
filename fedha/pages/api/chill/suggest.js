import { requireUser } from '../../../lib/require-user';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { nvidiaChat } from '../../../lib/nvidia-client';
import { organise } from '../../../lib/chill-names';

// "For You" in the Chill Room: series and movies like the ones you have, watched and liked, picked by the AI
// (NVIDIA, Groq as backup). Your taste comes from: the titles on your phone (chill_library), what you played and
// your reactions to earlier picks (chill_room: played, feedback), and the genres TVMaze / Apple list for your
// titles (chill_art). Cached for a day in 'chill_suggest'; ?refresh=1 asks again.
const get = async (uid, key) => (await supabaseAdmin.from('settings').select('value').eq('user_id', uid).eq('key', key).maybeSingle()).data?.value || null;

function parseJSON(text) {
  const s = String(text || '');
  const a = s.indexOf('{'); const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = await requireUser(req, res);
  if (!user) return;
  const [lib, room, art, cache] = await Promise.all([get(user.id, 'chill_library'), get(user.id, 'chill_room'), get(user.id, 'chill_art'), get(user.id, 'chill_suggest')]);

  const { shows, movies } = organise(lib?.files || []);
  const genresOf = (k) => (art?.[k]?.genres || []).join('/');
  const owned = [...shows.map((s) => `${s.title} (series${genresOf(`show:${s.title}`) ? `, ${genresOf(`show:${s.title}`)}` : ''}; has S${s.seasons.join(',S')})`), ...movies.map((m) => `${m.title}${m.year ? ` ${m.year}` : ''} (movie${genresOf(`movie:${m.title}`) ? `, ${genresOf(`movie:${m.title}`)}` : ''})`)];
  const played = Object.keys(room?.played || {}).map((k) => k.replace(/^movie:/, '').split('|')[0]);
  const fb = room?.feedback || {};
  const liked = Object.keys(fb).filter((t) => fb[t] === 'want');
  const seen = Object.keys(fb).filter((t) => fb[t] === 'seen');
  const no = Object.keys(fb).filter((t) => fb[t] === 'no');
  const basis = JSON.stringify([owned.length, played.length, Object.keys(fb).length]);

  const fresh = cache && cache.basis === basis && Date.now() - new Date(cache.at).getTime() < 24 * 3600e3;
  if (fresh && !req.query.refresh) return res.status(200).json(cache);
  if (!owned.length && !played.length && !liked.length) return res.status(200).json({ items: [], taste: null, at: new Date().toISOString() });

  const prompt = `You are a film and TV curator for one person in Kenya who loves watching series and movies in the evening (usually relaxed and a bit high, so gripping, binge-able, great-atmosphere picks work best).

On their phone now: ${owned.join('; ') || 'nothing yet'}.
Played recently: ${[...new Set(played)].join(', ') || 'none'}.
They want to watch (liked your earlier picks): ${liked.join(', ') || 'none'}.
Already seen: ${seen.join(', ') || 'none'}.
Not interested: ${no.join(', ') || 'none'}.

Suggest 12 titles they have not seen and do not already have: 8 series and 4 movies, closest to their taste first. Never suggest anything listed above. Real, well-known titles only, with the exact official title and first-release year.
Return JSON only:
{"taste":"one sentence describing their taste, in second person","items":[{"title":"...","type":"series"|"movie","year":2008,"because":"one title from their list it is like","why":"one short sentence on why they'd love it, no spoilers"}]}`;

  try {
    const out = await nvidiaChat({ prompt, system: 'You output only valid JSON. No markdown, no commentary.', temperature: 0.7, maxTokens: 1400 });
    const j = parseJSON(out);
    const ownedTitles = new Set([...shows.map((s) => s.title), ...movies.map((m) => m.title), ...Object.keys(fb)].map((t) => t.toLowerCase()));
    const items = (j?.items || []).filter((x) => x?.title && !ownedTitles.has(String(x.title).toLowerCase())).slice(0, 12)
      .map((x) => ({ title: String(x.title).slice(0, 80), type: x.type === 'movie' ? 'movie' : 'series', year: Number(x.year) || null, because: String(x.because || '').slice(0, 60), why: String(x.why || '').slice(0, 200) }));
    const value = { items, taste: j?.taste ? String(j.taste).slice(0, 240) : null, at: new Date().toISOString(), basis };
    if (items.length) await supabaseAdmin.from('settings').upsert({ user_id: user.id, key: 'chill_suggest', value, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
    return res.status(200).json(items.length ? value : cache || value);
  } catch (e) {
    return res.status(200).json(cache || { items: [], taste: null, error: 'The AI is busy right now. Try again in a minute.' });
  }
}
