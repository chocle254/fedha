import { requireUser } from '../../../lib/require-user';
import { klines } from '../../../lib/market';

// Chart candles from our server: MT5 markets (gold, silver, forex, oil, indices) always, crypto when the browser
// cannot reach Binance directly.
const INTERVALS = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1d', '1w'];

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = await requireUser(req, res);
  if (!user) return;
  const symbol = String(req.query.symbol || '').toUpperCase();
  const interval = INTERVALS.includes(req.query.interval) ? req.query.interval : '15m';
  if (!/^[A-Z0-9]{3,20}$/.test(symbol)) return res.status(400).json({ error: 'Invalid symbol.' });
  try {
    const candles = await klines(symbol, { interval, limit: 500 });
    if (!candles) return res.status(502).json({ error: 'Could not load chart data.' });
    return res.status(200).json({ symbol, interval, candles });
  } catch {
    return res.status(502).json({ error: 'Could not load chart data.' });
  }
}
