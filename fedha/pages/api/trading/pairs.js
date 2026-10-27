// Every USDT pair on Binance Spot with last price, 24h change and volume (compact, for the pair picker).
let cache = null;

export default async function handler(req, res) {
  if (cache && Date.now() - cache.at < 30000) return res.status(200).json(cache.body);
  try {
    const r = await fetch('https://api.binance.com/api/v3/ticker/24hr?type=MINI', { cache: 'no-store' });
    if (!r.ok) return res.status(502).json({ error: 'Binance did not return pairs.' });
    const pairs = (await r.json())
      .filter((t) => t.symbol.endsWith('USDT') && Number(t.quoteVolume) > 0)
      .map((t) => {
        const last = Number(t.lastPrice);
        const open = Number(t.openPrice);
        return [t.symbol, last, open > 0 ? Math.round(((last - open) / open) * 10000) / 100 : 0, Math.round(Number(t.quoteVolume))];
      })
      .sort((a, b) => b[3] - a[3]);
    cache = { at: Date.now(), body: { pairs } };
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json(cache.body);
  } catch {
    return res.status(502).json({ error: 'Could not load pairs.' });
  }
}
