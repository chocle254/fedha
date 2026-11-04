// lib/paper-reset.js — start the paper account again from scratch.
//   • Automatically when it's blown: equity at or below zero, or under 5% of the start with nothing open.
//   • By hand: Trading → Settings → Reset everything (optionally with a new starting balance).
// A reset deletes every paper trade (both books) and clears the channel ladder, the channel pauses and the growth
// challenge, so every channel starts again from zero. Real MT5 trades (broker_trades) and the signal feed are never
// touched. A short log of resets is kept in broker_settings.resets (last 10).
import { supabaseAdmin } from './supabaseAdmin';
import { getSettings, getAccount, notify } from './trading';

export async function resetPaper(userId, { balance = null, reason = 'manual' } = {}) {
  const s = await getSettings(userId);
  const start = Number(balance) > 0 ? Math.min(1e9, Number(balance)) : Number(s.paper_balance) || 1000;
  const acct = await getAccount(userId, s).catch(() => null);
  const { count } = await supabaseAdmin.from('paper_trades').select('id', { count: 'exact', head: true }).eq('user_id', userId);
  const { error } = await supabaseAdmin.from('paper_trades').delete().eq('user_id', userId);
  if (error) throw new Error('Could not clear the paper trades.');
  const { ladder: _l, pauses: _p, growth: _g, ...bs } = s.broker_settings || {};
  const resets = [{ at: new Date().toISOString(), reason, equity: acct?.equity ?? null, from: Number(s.paper_balance) || null, to: start, trades: count || 0 }, ...(bs.resets || [])].slice(0, 10);
  const { error: e2 } = await supabaseAdmin.from('trade_settings').update({ paper_balance: start, broker_settings: { ...bs, resets }, updated_at: new Date().toISOString() }).eq('user_id', userId);
  if (e2) throw new Error('Trades cleared, but the settings could not be saved.');
  return { start, cleared: count || 0, equity: acct?.equity ?? null };
}

// Blown? Reset to the same starting balance and tell the phone. Cheap: one read of the account.
export async function resetIfBlown(userId) {
  const s = await getSettings(userId);
  const start = Number(s.paper_balance) || 0;
  const a = await getAccount(userId, s);
  const { count: open } = await supabaseAdmin.from('paper_trades').select('id', { count: 'exact', head: true }).eq('user_id', userId).in('status', ['open', 'pending']);
  const blown = a.equity <= 0 || (a.equity < start * 0.05 && !open);
  if (!blown) return null;
  const r = await resetPaper(userId, { reason: 'blown' });
  await notify({ title: '💥 Paper account blown: fresh start', body: `It hit $${a.equity.toFixed(2)}. ${r.cleared} trades, the channel ladder and pauses were cleared. New balance: $${r.start}.` }, 'paper-reset');
  return r;
}
