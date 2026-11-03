// pages/api/trading/channels.js — pause or resume a signal channel by hand (lib/channel-pause.js does the automatic ones).
// POST { source, action: 'pause' | 'resume', days? } → { pauses }
import { requireUser } from '../../../lib/require-user';
import { getSettings } from '../../../lib/trading';
import { pauseChannel, resumeChannel, PAUSE_DAYS } from '../../../lib/channel-pause';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = await requireUser(req, res);
  if (!user) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { source, action } = req.body || {};
  const days = Math.max(1, Math.min(60, Number(req.body?.days) || PAUSE_DAYS));
  if (!source || typeof source !== 'string') return res.status(400).json({ error: 'Which channel?' });
  if (action === 'pause') await pauseChannel(user.id, source, { days, reason: 'Paused by you', auto: false });
  else if (action === 'resume') await resumeChannel(user.id, source);
  else return res.status(400).json({ error: 'Unknown action' });
  const s = await getSettings(user.id);
  return res.status(200).json({ pauses: s.broker_settings?.pauses || {} });
}
