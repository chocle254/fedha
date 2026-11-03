import { requireUser } from '../../../lib/require-user';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { BROKER_ACCOUNTS, accountId, provisioningAccount, mt } from '../../../lib/metaapi';
import { brokerOverview, getBrokerSettings, syncBrokerTrades } from '../../../lib/broker';
import { fetchRates } from '../../../lib/exchange';

// MT5 accounts (XM, LiteFinance via MetaApi): status, settings and trades for the Trading page.
// The MetaApi token and account ids live in env vars, so only the signal owner may use this.
const clamp = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);

// GET ?check=1 — connection health without secrets or balances: are the token and account ids set, and how does
// MetaApi see each account (deployed? connected to the broker? demo or real?). Cached 5 minutes.
let checked = null;
async function health() {
  if (checked && Date.now() - checked.at < 300000) return checked.out;
  const out = { token: !!process.env.METAAPI_TOKEN, accounts: {} };
  for (const a of BROKER_ACCOUNTS) {
    const id = accountId(a.key);
    if (!id) { out.accounts[a.key] = { set: false }; continue; }
    const r = { set: true };
    try { const p = await provisioningAccount(id); Object.assign(r, { state: p?.state, connection: p?.connectionStatus, server: p?.server, platform: p?.platform }); }
    catch (e) { r.error = `${e.status || ''} ${e.message}`.trim().slice(0, 160); }
    if (r.connection === 'CONNECTED') { try { const i = await mt.accountInfo(id); r.mode = i?.type; r.currency = i?.currency; r.leverage = i?.leverage; } catch (e) { r.infoError = e.message.slice(0, 120); } }
    out.accounts[a.key] = r;
  }
  checked = { at: Date.now(), out };
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET' && req.query?.check) return res.status(200).json(await health());
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
    // Growth challenge: { on, start } — start a fresh small balance (from about $7) that steps risk down as it grows.
    if (b.growth && typeof b.growth === 'object') {
      // The start can be given in KES (start_kes, e.g. 1000): converted to dollars at today's rate.
      const on = !!b.growth.on;
      const restart = on && (!cur.growth?.since || b.growth.restart); // switching back on resumes
      let start = clamp(b.growth.start, 1, 100000, 7);
      let startKes = null;
      if (restart && Number(b.growth.start_kes) > 0) {
        startKes = clamp(b.growth.start_kes, 100, 10000000, 1000);
        const usd = (await fetchRates('KES'))?.USD;
        start = Math.round(startKes * (usd > 0 ? usd : 1 / 129) * 100) / 100;
      }
      const target = clamp(b.growth.target, 2, 1000000, cur.growth?.target || 100);
      next.growth = on
        ? restart
          ? { on: true, start, start_kes: startKes, target, since: new Date().toISOString(), notified: {} }
          : { ...cur.growth, on: true, target }
        : { ...(cur.growth || {}), on: false };
    }
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
