// pages/api/byte-voice.js — Professor Byte's real voice: Canopy Labs' Orpheus neural text-to-speech on Groq
// (same GROQ_API_KEY as the rest of Luxe). Male voices troy, austin, daniel. A one-word tone in brackets
// ([cheerful], [excited], [dramatic]…) sets how he says it. Nothing is stored; the phone keeps a short memory.
//
// POST { text, voice, tone } → audio/wav. Text over 190 characters is cut: the client sends sentence chunks.
import { requireUser } from '../../lib/require-user';

export const config = { maxDuration: 30 };
const VOICES = ['troy', 'austin', 'daniel'];
const TONES = ['cheerful', 'friendly', 'warm', 'professional', 'calm', 'excited', 'whisper', 'dramatic'];
const MODEL = process.env.GROQ_TTS_MODEL || 'canopylabs/orpheus-v1-english';

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.status(500).json({ error: 'GROQ_API_KEY not set' });
  const text = String(req.body?.text || '').replace(/[*_#`[\]<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 190);
  if (!text) return res.status(400).json({ error: 'Nothing to say' });
  const voice = VOICES.includes(req.body?.voice) ? req.body.voice : 'troy';
  const tone = TONES.includes(req.body?.tone) ? req.body.tone : '';
  try {
    const r = await fetch('https://api.groq.com/openai/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: MODEL, voice, input: tone ? `[${tone}] ${text}` : text, response_format: 'wav' }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      console.warn('[fedha] byte-voice groq failed:', r.status, d.error?.message);
      return res.status(r.status === 429 ? 429 : 502).json({ error: r.status === 429 ? 'Voice is busy' : (d.error?.message || 'Voice failed') });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', r.headers.get('content-type') || 'audio/wav');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.status(200).send(buf);
  } catch (e) {
    console.warn('[fedha] byte-voice error:', e.message);
    return res.status(502).json({ error: 'Voice failed' });
  }
}
