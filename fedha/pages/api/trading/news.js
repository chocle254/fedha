import { requireUser } from '../../../lib/require-user';
import { upcomingNews, newsCheck, DANGER, CAUTION } from '../../../lib/news-guard';
import { MT5_SYMBOLS } from '../../../lib/instruments';

// High-impact news in the next 24 h for the markets Luxe trades, and the guard's state for the open chart.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = await requireUser(req, res);
  if (!user) return;
  const symbol = String(req.query.symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
  const markets = [...new Set([...MT5_SYMBOLS, 'BTCUSDT', ...(symbol ? [symbol] : [])])];
  const [events, check] = await Promise.all([upcomingNews(markets, 24), symbol ? newsCheck(symbol) : null]);
  return res.status(200).json({ events: events.slice(0, 12), check, windows: { danger: DANGER, caution: CAUTION } });
}
