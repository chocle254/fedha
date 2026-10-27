import { requireUser } from '../../../lib/require-user';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { openPaperTrade, refreshTrades, openManualOrder, closeOrCancel } from '../../../lib/trading';

// PAPER ONLY: simulated trades scored against real Binance prices.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin.from('paper_trades').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(200);
    if (error) return res.status(500).json({ error: 'Could not load trades.' });
    return res.status(200).json({ trades: await refreshTrades(user.id, data) });
  }

  if (req.method === 'POST') {
    const b = req.body || {};
    if (b.manual) {
      const result = await openManualOrder({ userId: user.id, symbol: String(b.symbol || '').toUpperCase(), side: b.side, type: b.type, qty: b.qty, quoteQty: b.quoteQty, price: b.price, stopLoss: b.stopLoss, takeProfits: b.takeProfits });
      if (!result.ok) return res.status(422).json({ error: result.error });
      return res.status(200).json({ trade: result.trade });
    }
    const { signalId, riskUsdt } = b;
    if (!signalId) return res.status(400).json({ error: 'signalId is required' });
    const { data: signal } = await supabaseAdmin.from('trade_signals').select('*').eq('id', signalId).eq('user_id', user.id).maybeSingle();
    if (!signal) return res.status(404).json({ error: 'Signal not found.' });
    const result = await openPaperTrade({ userId: user.id, signal, riskUsdt: Number(riskUsdt) > 0 ? Number(riskUsdt) : null, auto: false });
    if (!result.ok) return res.status(422).json({ error: result.error });
    return res.status(200).json({ trade: result.trade });
  }

  if (req.method === 'PATCH') {
    const id = String(req.body?.id || '');
    if (!id) return res.status(400).json({ error: 'id is required' });
    const result = await closeOrCancel(user.id, id);
    if (!result.ok) return res.status(422).json({ error: result.error });
    return res.status(200).json({ trade: result.trade });
  }

  if (req.method === 'DELETE') {
    const id = String(req.query.id || '');
    if (!id) return res.status(400).json({ error: 'id is required' });
    await supabaseAdmin.from('paper_trades').delete().eq('id', id).eq('user_id', user.id);
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}
