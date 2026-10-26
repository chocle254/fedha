import { requireUser } from '../../../lib/require-user';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { createSignal, evaluateSignal } from '../../../lib/signals';

// PAPER TRADING ONLY: records and scores signals, never places orders.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin.from('trade_signals').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(200);
    if (error) return res.status(500).json({ error: 'Could not load signals.' });
    const live = data.filter((s) => s.status === 'pending' || s.status === 'open').slice(0, 25);
    const results = await Promise.allSettled(live.map((s) => evaluateSignal(s)));
    const byId = {};
    await Promise.all(results.map(async (r, i) => {
      const patch = r.status === 'fulfilled' ? r.value : null;
      if (!patch) return;
      const s = live[i];
      if (patch.status !== s.status || patch.tp_hit !== s.tp_hit) {
        await supabaseAdmin.from('trade_signals').update(patch).eq('id', s.id).eq('user_id', user.id);
      }
      byId[s.id] = patch;
    }));
    return res.status(200).json({ signals: data.map((s) => (byId[s.id] ? { ...s, ...byId[s.id] } : s)) });
  }

  if (req.method === 'POST') {
    const { source, text } = req.body || {};
    if (!text || String(text).trim().length < 8) return res.status(400).json({ error: 'Paste the signal text first.' });
    const result = await createSignal({ userId: user.id, source, text });
    if (!result.ok) return res.status(422).json({ error: result.error });
    return res.status(200).json({ signal: result.signal });
  }

  if (req.method === 'DELETE') {
    const id = String(req.query.id || '');
    if (!id) return res.status(400).json({ error: 'id is required' });
    await supabaseAdmin.from('trade_signals').delete().eq('id', id).eq('user_id', user.id);
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}
