import { requireUser } from '../../../lib/require-user';

// Game Room → Live now: who is streaming the game right this minute, so it can be watched inside Luxe.
// Uses the platforms' own official APIs (both free), switched on by keys in Vercel's environment:
//   YouTube  YOUTUBE_API_KEY                          (Google Cloud → YouTube Data API v3)
//   Twitch   TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET  (dev.twitch.tv → Register Your Application)
// A platform without its key is simply left out and reported in `missing`, so the page can say what to set up.
// YouTube allows about 100 live searches a day on a free key, so results are kept for 15 minutes (Twitch: 2).
const YT_TTL = 15 * 60e3; const TW_TTL = 2 * 60e3;
const cache = new Map(); // key -> { at, data }
const clip = (v, n) => String(v ?? '').slice(0, n);
const getJSON = async (url, opts = {}) => {
  const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(12000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error?.message || j?.message || `HTTP ${r.status}`), { status: r.status });
  return j;
};
async function cached(key, ttl, make) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.data;
  const data = await make();
  cache.set(key, { at: Date.now(), data });
  if (cache.size > 40) cache.delete(cache.keys().next().value);
  return data;
}

async function youtube(q) {
  const key = process.env.YOUTUBE_API_KEY;
  const search = await getJSON(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&eventType=live&videoEmbeddable=true&maxResults=20&order=viewCount&relevanceLanguage=en&q=${encodeURIComponent(q)}&key=${key}`);
  const items = (search.items || []).filter((x) => x.id?.videoId);
  if (!items.length) return [];
  // How many are watching each one right now.
  const live = await getJSON(`https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${items.map((x) => x.id.videoId).join(',')}&key=${key}`).catch(() => ({ items: [] }));
  const watching = new Map((live.items || []).map((v) => [v.id, Number(v.liveStreamingDetails?.concurrentViewers) || 0]));
  return items.map((x) => ({
    on: 'youtube', id: x.id.videoId, title: clip(x.snippet?.title, 140), who: clip(x.snippet?.channelTitle, 60),
    viewers: watching.get(x.id.videoId) || 0, thumb: x.snippet?.thumbnails?.medium?.url || `https://i.ytimg.com/vi/${x.id.videoId}/mqdefault.jpg`,
  }));
}

let twToken = null; // { token, until }
async function twitchToken() {
  if (twToken && Date.now() < twToken.until) return twToken.token;
  const j = await getJSON(`https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' });
  twToken = { token: j.access_token, until: Date.now() + (Number(j.expires_in) || 3600) * 1000 - 60e3 };
  return twToken.token;
}
async function twitch(game) {
  const headers = { 'Client-Id': process.env.TWITCH_CLIENT_ID, Authorization: `Bearer ${await twitchToken()}` };
  const g = await getJSON(`https://api.twitch.tv/helix/games?name=${encodeURIComponent(game)}`, { headers });
  const id = g.data?.[0]?.id;
  if (!id) return [];
  const s = await getJSON(`https://api.twitch.tv/helix/streams?game_id=${id}&first=20&language=en`, { headers });
  return (s.data || []).map((x) => ({
    on: 'twitch', id: x.user_login, title: clip(x.title, 140), who: clip(x.user_name, 60), viewers: Number(x.viewer_count) || 0,
    thumb: String(x.thumbnail_url || '').replace('{width}', '440').replace('{height}', '248'),
  }));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!(await requireUser(req, res))) return;
  const q = clip(req.query.q, 60).trim() || 'GTA 6';
  const game = clip(req.query.game, 60).trim() || 'Grand Theft Auto VI';
  const missing = []; const errors = {};
  const jobs = [];
  if (process.env.YOUTUBE_API_KEY) jobs.push(cached(`yt|${q.toLowerCase()}`, YT_TTL, () => youtube(q)).catch((e) => { errors.youtube = e.status === 403 ? 'YouTube says the key is over its daily limit or not allowed. It resets at midnight Pacific time.' : 'YouTube did not answer.'; return []; }));
  else missing.push('youtube');
  if (process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET) jobs.push(cached(`tw|${game.toLowerCase()}`, TW_TTL, () => twitch(game)).catch(() => { errors.twitch = 'Twitch did not answer.'; return []; }));
  else missing.push('twitch');
  const streams = (await Promise.all(jobs)).flat().sort((a, b) => b.viewers - a.viewers);
  return res.status(200).json({ streams, missing, errors, q, game, at: new Date().toISOString() });
}
