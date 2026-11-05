import { requireUser } from '../../../lib/require-user';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { daysReport } from '../../../lib/trading-days';

// Good days and bad days (lib/trading-days.js): every closed signal in the main paper book, by calendar day,
// weekday and trading session. Worked out on request, nothing stored.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = await requireUser(req, res);
  if (!user) return;
  const tzMin = Math.max(-720, Math.min(840, Number(req.query.tz) || 180));
  const rows = [];
  for (let from = 0; from < 20000; from += 1000) { // paged: Supabase returns at most 1000 rows per request
    const { data, error } = await supabaseAdmin.from('paper_trades')
      .select('signal_id, source, status, pnl_usdt, risk_usdt, actual_risk_usdt, created_at, closed_at, book')
      .eq('user_id', user.id).in('status', ['won', 'lost']).not('signal_id', 'is', null)
      .or('book.is.null,book.eq.main')
      .order('created_at', { ascending: true }).range(from, from + 999);
    if (error) return res.status(500).json({ error: 'Could not load trades.' });
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return res.status(200).json(daysReport(rows, { tzMin }));
}
