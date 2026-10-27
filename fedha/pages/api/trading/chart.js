import { requireUser } from '../../../lib/require-user';

// Fallback for the chart when the browser cannot reach Binance directly.
const INTERVALS = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1d', '1w'];

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = await requireUser(req, res);
  if (!user) return;
  const symbol = String(req.query.symbol || '').toUpperCase();
  const interval = INTERVALS.includes(req.query.interval) ? req.query.interval : '15m';
  if (!/^[A-Z0-9]{5,20}$/.test(symbol)) return res.status(400).json({ error: 'Invalid symbol.' });
  try {
    const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=500`, { cache: 'no-store' });
    if (!r.ok) return res.status(502).json({ error: 'Binance did not return chart data.' });
    const candles = (await r.json()).map((c) => ({ t: c[0], o: Number(c[1]), h: Number(c[2]), l: Number(c[3]), c: Number(c[4]), v: Number(c[5]) }));
    return res.status(200).json({ symbol, interval, candles });
  } catch {
    return res.status(502).json({ error: 'Could not load chart data.' });
  }
}
