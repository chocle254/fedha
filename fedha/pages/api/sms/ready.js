import { requireUser } from '../../../lib/require-user';
import { readyToRecord, markRecorded, setAuto } from '../../../lib/sms-capture';

// Automatic recording (components/SmsAutoRecorder.js):
//   GET  → { auto: { on, since }, items: [{ id, received_at, parsed, plan }] } messages to record now
//   POST { id, transaction_ids } → that message was recorded
//   PUT  { on } → switch automatic recording on / off (on again keeps the original start time)
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = await requireUser(req, res);
  if (!user) return;
  if (req.method === 'POST') { await markRecorded(user.id, req.body?.id, req.body?.transaction_ids); return res.status(200).json({ ok: true }); }
  if (req.method === 'PUT') return res.status(200).json({ auto: await setAuto(user.id, !!req.body?.on) });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  return res.status(200).json(await readyToRecord(user.id));
}
