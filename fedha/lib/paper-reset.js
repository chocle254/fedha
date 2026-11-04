// lib/paper-reset.js — start the paper BALANCE again; the channels' track record is never wiped.
//   • Automatically when it's blown: equity at or below zero, or under 5% of the start with nothing open.
//   • By hand: Trading → Settings → Reset balance (optionally with a new starting balance).
// A reset sets broker_settings.paper_since = now and the new paper_balance: the account's equity counts only trades
// opened after that moment, while every older trade stays and keeps counting for the channel report cards, the
// ladder (Trial → Proven → Real) and the channel pauses, so we always know which channels are good.
// A short log of resets is kept in broker_settings.resets (last 10).
import { supabaseAdmin } from './supabaseAdmin';
import { getSettings, getAccount, notify } from './trading';

export async function resetPaper(userId, { balance = null, reason = 'manual' } = {}) {
  const s = await getSettings(userId);
  const start = Number(balance) > 0 ? Math.min(1e9, Number(balance)) : Number(s.paper_balance) || 1000;
  const acct = await getAccount(userId, s).catch(() => null);
  const bs = s.broker_settings || {};
  let q = supabaseAdmin.from('paper_trades').select('id', { count: 'exact', head: true }).eq('user_id', userId);
  if (bs.paper_since) q = q.gte('created_at', bs.paper_since);
  const { count } = await q;
  const at = new Date().toISOString();
  const resets = [{ at, reason, equity: acct?.equity ?? null, from: Number(s.paper_balance) || null, to: start, trades: count || 0 }, ...(bs.resets || [])].slice(0, 10);
  const { error } = await supabaseAdmin.from('trade_settings').update({ paper_balance: start, broker_settings: { ...bs, paper_since: at, resets }, updated_at: at }).eq('user_id', userId);
  if (error) throw new Error('Could not reset the balance.');
  return { start, trades: count || 0, equity: acct?.equity ?? null };
}

// Blown? Start the balance again (same starting amount) and tell the phone.
export async function resetIfBlown(userId) {
  const s = await getSettings(userId);
  const start = Number(s.paper_balance) || 0;
  const a = await getAccount(userId, s);
  let q = supabaseAdmin.from('paper_trades').select('id', { count: 'exact', head: true }).eq('user_id', userId).in('status', ['open', 'pending']);
  if (s.broker_settings?.paper_since) q = q.gte('created_at', s.broker_settings.paper_since);
  const { count: open } = await q;
  const blown = a.equity <= 0 || (a.equity < start * 0.05 && !open);
  if (!blown) return null;
  const r = await resetPaper(userId, { reason: 'blown' });
  await notify({ title: '💥 Paper account blown: fresh balance', body: `It hit $${a.equity.toFixed(2)}. New balance: $${r.start}. Every channel keeps its track record.` }, 'paper-reset');
  return r;
}
