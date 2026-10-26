import { requireUser } from '../../../lib/require-user';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = await requireUser(req, res);
  if (!user) return;
  const symbols = [...new Set(String(req.query.symbols || '').toUpperCase().split(',').map((s) => s.trim()).filter((s) => /^[A-Z0-9]{5,15}$/.test(s)))].slice(0, 30);
  if (!symbols.length) return res.status(200).json({ quotes: [] });
  try {
    const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`, { cache: 'no-store' });
    if (!r.ok) return res.status(502).json({ error: 'Binance did not return prices.' });
    const quotes = (await r.json()).map((q) => ({ symbol: q.symbol, price: Number(q.lastPrice), change: Number(q.priceChangePercent) }));
    return res.status(200).json({ quotes });
  } catch {
    return res.status(502).json({ error: 'Could not load prices.' });
  }
}
