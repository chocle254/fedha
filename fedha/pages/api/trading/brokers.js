import { requireUser } from '../../../lib/require-user';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { BROKER_ACCOUNTS } from '../../../lib/metaapi';
import { brokerOverview, getBrokerSettings, syncBrokerTrades } from '../../../lib/broker';

// MT5 accounts (XM, LiteFinance via MetaApi): status, settings and trades for the Trading page.
// The MetaApi token and account ids live in env vars, so only the signal owner may use this.
const clamp = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = await requireUser(req, res);
  if (!user) return;
  const owner = process.env.SIGNAL_OWNER_USER_ID;
  if (owner && user.id !== owner && user.id !== 'local') return res.status(403).json({ error: 'Only the account owner can use the MT5 accounts.' });

  if (req.method === 'GET') return res.status(200).json(await brokerOverview(user.id));

  if (req.method === 'POST' && req.body?.action === 'sync') {
    const r = await syncBrokerTrades(user.id).catch((e) => ({ error: e.message }));
    return res.status(200).json({ ...r, ...(await brokerOverview(user.id)) });
  }

  if (req.method === 'PUT') {
    const b = req.body || {};
    const cur = await getBrokerSettings(user.id);
    const next = { ...cur, breakeven: b.breakeven ?? cur.breakeven, paper_too: b.paper_too ?? cur.paper_too };
    // Real-money trading needs an explicit, typed confirmation from the page.
    if (b.allow_real === true && b.confirm_real !== 'TRADE REAL MONEY') return res.status(400).json({ error: 'Type TRADE REAL MONEY to allow real-money accounts.' });
    if (typeof b.allow_real === 'boolean') next.allow_real = b.allow_real;
    for (const a of BROKER_ACCOUNTS) {
      const x = b[a.key];
      if (!x) continue;
      next[a.key] = {
        enabled: x.enabled ?? cur[a.key].enabled,
        risk_pct: clamp(x.risk_pct, 0.1, 5, cur[a.key].risk_pct),
        min_confidence: clamp(x.min_confidence, 0, 100, cur[a.key].min_confidence),
        daily_loss_pct: clamp(x.daily_loss_pct, 0, 50, cur[a.key].daily_loss_pct),
      };
    }
    const { error } = await supabaseAdmin.from('trade_settings').upsert({ user_id: user.id, broker_settings: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) return res.status(500).json({ error: error.message.includes('broker_settings') ? 'Run supabase-migration-broker-trades.sql first.' : 'Could not save.' });
    return res.status(200).json(await brokerOverview(user.id));
  }

  res.setHeader('Allow', 'GET, POST, PUT');
  return res.status(405).json({ error: 'Method not allowed' });
}
