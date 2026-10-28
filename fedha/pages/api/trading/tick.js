import crypto from 'crypto';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { refreshTrades } from '../../../lib/trading';
import { syncBrokerTrades } from '../../../lib/broker';

// Called every minute by the Telegram listener on the phone, so trades are checked (and TP / SL / fill
// notifications are sent) even when the Trading page is closed. Also syncs the MT5 accounts (fills, TP/SL, break-even).
function same(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const secret = process.env.INGEST_SECRET;
  const userId = process.env.SIGNAL_OWNER_USER_ID;
  if (!secret || !userId || !same(req.headers['x-ingest-secret'], secret)) return res.status(401).json({ error: 'Unauthorized' });
  const broker = await syncBrokerTrades(userId).catch((e) => ({ error: e.message }));
  const { data, error } = await supabaseAdmin.from('paper_trades').select('*').eq('user_id', userId).in('status', ['pending', 'open']).limit(30);
  if (error) return res.status(500).json({ error: 'Could not load trades.' });
  if (!data.length) return res.status(200).json({ ok: true, checked: 0, broker });
  const after = await refreshTrades(userId, data);
  return res.status(200).json({ ok: true, checked: data.length, open: after.filter((t) => t.status === 'open').length, broker });
}
