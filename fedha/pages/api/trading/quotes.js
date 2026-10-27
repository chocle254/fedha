import { requireUser } from '../../../lib/require-user';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = await requireUser(req, res);
  if (!user) return;
  const symbols = [...new Set(String(req.query.symbols || '').toUpperCase().split(',').map((s) => s.trim()).filter((s) => /^[A-Z0-9]{5,15}$/.test(s)))].slice(0, 30);
  if (!symbols.length) return res.status(200).json({ quotes: [] });
  const q = encodeURIComponent(JSON.stringify(symbols));
  try {
    const [tickerRes, bookRes] = await Promise.all([
      fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${q}`, { cache: 'no-store' }),
      fetch(`https://api.binance.com/api/v3/ticker/bookTicker?symbols=${q}`, { cache: 'no-store' }).catch(() => null)
    ]);
    if (!tickerRes.ok) return res.status(502).json({ error: 'Binance did not return prices.' });
    const book = {};
    if (bookRes && bookRes.ok) for (const b of await bookRes.json()) book[b.symbol] = { bid: Number(b.bidPrice), ask: Number(b.askPrice) };
    const quotes = (await tickerRes.json()).map((t) => {
      const b = book[t.symbol];
      const spreadPct = b && b.bid > 0 ? ((b.ask - b.bid) / ((b.ask + b.bid) / 2)) * 100 : null;
      return { symbol: t.symbol, price: Number(t.lastPrice), change: Number(t.priceChangePercent), spreadPct };
    });
    return res.status(200).json({ quotes });
  } catch {
    return res.status(502).json({ error: 'Could not load prices.' });
  }
}
