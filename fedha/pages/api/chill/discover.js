import { buildDiscover } from '../../../lib/chill-discover';

// GET /api/chill/discover: Trending and Latest for the Chill Room's Series / Movies / Animation tabs.
// The same for everyone (public charts, nothing personal), so the CDN keeps it for 6 hours; your taste is applied
// on the phone (lib/chill-taste.js) and in For You (api/chill/suggest.js).
export default async function handler(req, res) {
  try {
    const data = await buildDiscover();
    res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');
    return res.status(200).json(data);
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ series: {}, movies: {}, animation: {} });
  }
}
