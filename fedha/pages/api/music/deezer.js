import { requireUser } from '../../../lib/require-user';

// Music Room catalogue (popular music): a small pass-through to Deezer's public API, which doesn't allow calls
// straight from the browser. Only read-only catalogue paths are allowed. Cached at the edge for an hour.
const ALLOWED = [/^\/search(\/(track|artist|album))?$/, /^\/artist\/\d+(\/(top|related|radio|albums))?$/, /^\/chart\/\d+\/(tracks|artists)$/, /^\/track\/\d+$/, /^\/album\/\d+(\/tracks)?$/, /^\/playlist\/\d+\/tracks$/];

export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  const path = String(req.query.path || '');
  if (!ALLOWED.some((re) => re.test(path))) return res.status(400).json({ error: 'Not allowed' });
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) if (k !== 'path') qs.set(k, String(v));
  try {
    const r = await fetch(`https://api.deezer.com${path}${qs.toString() ? `?${qs}` : ''}`, { signal: AbortSignal.timeout(10000) });
    const j = await r.json();
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json(j);
  } catch {
    return res.status(502).json({ error: 'Deezer is not answering right now.' });
  }
}
