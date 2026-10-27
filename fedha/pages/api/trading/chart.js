import { requireUser } from '../../../lib/require-user';

const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'];

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = await requireUser(req, res);
  if (!user) return;
  const symbol = String(req.query.symbol || '').toUpperCase();
  const interval = INTERVALS.includes(req.query.interval) ? req.query.interval : '15m';
  if (!/^[A-Z0-9]{5,15}$/.test(symbol)) return res.status(400).json({ error: 'Invalid symbol.' });
  try {
    const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=200`, { cache: 'no-store' });
    if (!r.ok) return res.status(502).json({ error: 'Binance did not return chart data.' });
    const candles = (await r.json()).map((c) => ({ t: c[0], o: Number(c[1]), h: Number(c[2]), l: Number(c[3]), c: Number(c[4]) }));
    return res.status(200).json({ symbol, interval, candles });
  } catch {
    return res.status(502).json({ error: 'Could not load chart data.' });
  }
}
