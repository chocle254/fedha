import { requireUser } from '../../../lib/require-user';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

// Recent Telegram messages and what happened to each, plus the listener's last heartbeat.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = await requireUser(req, res);
  if (!user) return;
  const [inbox, settings] = await Promise.all([
    supabaseAdmin.from('signal_inbox').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(60),
    supabaseAdmin.from('trade_settings').select('listener_seen_at, listener_stats').eq('user_id', user.id).maybeSingle()
  ]);
  return res.status(200).json({
    inbox: inbox.data || [],
    needsMigration: !!inbox.error,
    listener: settings.data ? { seenAt: settings.data.listener_seen_at, stats: settings.data.listener_stats } : null
  });
}
