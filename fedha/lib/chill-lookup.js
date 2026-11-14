// Poster, genres and where-to-watch for a title the AI named (server side): TVMaze for series, Apple for movies.
const j = async (url) => { try { const r = await fetch(url); return r.ok ? r.json() : null; } catch { return null; } };

export async function look(x) {
  if (x.type === 'movie') {
    const d = await j(`https://itunes.apple.com/search?term=${encodeURIComponent(x.title)}&entity=movie&limit=5`);
    const hits = d?.results || [];
    const m = hits.find((r) => x.year && String(r.releaseDate || '').startsWith(String(x.year))) || hits[0];
    return m ? { poster: String(m.artworkUrl100 || '').replace(/\/\d+x\d+bb\.(png|jpg)$/, '/400x600bb.jpg'), genres: [m.primaryGenreName, x.animation ? 'Animation' : null].filter(Boolean) } : {};
  }
  const s = await j(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(x.title)}`);
  return s ? { poster: s.image?.medium || null, genres: [...(s.genres || []), ...(s.type === 'Animation' ? ['Animation'] : [])], rating: s.rating?.average || null, where: s.webChannel?.name || s.network?.name || '' } : {};
}
