import { requireUser } from '../../../lib/require-user';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { getSettings } from '../../../lib/trading';

// PAPER ONLY. Live mode is rejected until real execution is built and enabled.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method === 'GET') return res.status(200).json({ settings: await getSettings(user.id) });

  if (req.method === 'PUT') {
    const b = req.body || {};
    if (b.mode && b.mode !== 'paper') return res.status(400).json({ error: 'Live trading is not enabled yet. Only paper mode is available.' });
    const risk = Number(b.risk_usdt);
    const minRr = Number(b.min_rr ?? 0);
    if (!(risk > 0 && risk <= 1000)) return res.status(400).json({ error: 'Risk per trade must be between 0 and 1000 USDT.' });
    if (!(minRr >= 0 && minRr <= 20)) return res.status(400).json({ error: 'Minimum reward:risk must be between 0 and 20.' });
    const row = { user_id: user.id, auto_enabled: !!b.auto_enabled, mode: 'paper', risk_usdt: risk, min_rr: minRr, updated_at: new Date().toISOString() };
    const { error } = await supabaseAdmin.from('trade_settings').upsert(row, { onConflict: 'user_id' });
    if (error) return res.status(500).json({ error: 'Could not save settings.' });
    return res.status(200).json({ settings: row });
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method not allowed' });
}
