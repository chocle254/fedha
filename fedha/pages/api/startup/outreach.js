import { requireUser } from '../../../lib/require-user';
import { nvidiaChat } from '../../../lib/nvidia-client';
import { VIBECODER, AMBITION } from '../../../lib/mentor-mindset';

// Customers tab: writes the next WhatsApp message to one person in your pipeline, for the stage they are at
// (first contact, demo invite, trial check-in, asking them to pay, follow-up after silence), plus when to follow up.
// AI: NVIDIA, Groq as backup.
const STAGE_GOAL = {
  lead: 'first contact: start a real conversation about the problem in their life (Mom Test style), no pitch',
  contacted: 'they replied or were contacted: ask for 15 minutes to show them a quick demo',
  demo: 'they saw the demo: offer a short free trial with a clear end date',
  trial: 'they are trying it: check how it went and ask them to pay to keep using it, with the price and the M-Pesa till/number',
  paid: 'they paid: thank them, ask for one honest piece of feedback and one introduction to someone like them',
  lost: 'they went quiet or said no: a light, no-pressure check-in that asks what would have to change',
};

function parseJSON(t) { const s = String(t || ''); const a = s.indexOf('{'); const b = s.lastIndexOf('}'); try { return a >= 0 ? JSON.parse(s.slice(a, b + 1)) : null; } catch { return null; } }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requireUser(req, res);
  if (!user) return;
  const { startup = {}, customer = {}, price = '' } = req.body || {};
  const stage = STAGE_GOAL[customer.stage] ? customer.stage : 'lead';
  const quiet = customer.last_at ? Math.floor((Date.now() - new Date(customer.last_at).getTime()) / 864e5) : null;
  const prompt = `${VIBECODER}\n${AMBITION}\n
You write WhatsApp messages for a young Kenyan founder. Startup: ${startup.name || 'the startup'}. What it does: ${startup.mission || startup.solution || '—'}. Problem it solves: ${startup.problem || '—'}. Who it is for: ${startup.customer || '—'}.${price ? ` Price: ${price}.` : ''}
Person: ${customer.name || 'them'}${customer.segment ? ` (${customer.segment})` : ''}. Stage: ${stage}. Goal of this message: ${STAGE_GOAL[stage]}.${quiet != null ? ` Last contact ${quiet} day${quiet === 1 ? '' : 's'} ago.` : ''}${customer.notes ? ` Notes so far: ${String(customer.notes).slice(0, 500)}` : ''}
Write ONE short WhatsApp message (2-4 sentences, warm, plain English, can open with a Swahili greeting if natural, no emojis spam, no hype, ends with one clear question). Return JSON only:
{"message":"...","follow_up_days":2,"tip":"one sentence: what to listen for in their reply"}`;
  try {
    const j = parseJSON(await nvidiaChat({ prompt, system: 'You output only valid JSON. No markdown, no commentary.', temperature: 0.7, maxTokens: 500 }));
    if (!j?.message) throw new Error('no message');
    return res.status(200).json({ message: String(j.message).slice(0, 800), follow_up_days: Math.min(14, Math.max(1, Number(j.follow_up_days) || 3)), tip: j.tip ? String(j.tip).slice(0, 200) : null });
  } catch {
    return res.status(503).json({ error: 'The AI is busy. Try again in a minute.' });
  }
}
