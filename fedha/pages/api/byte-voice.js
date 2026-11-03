// pages/api/byte-voice.js — Professor Byte's real voice, with a fall-back chain so he rarely drops to the phone voice:
//   1. ElevenLabs (your free key: ELEVENLABS_API_KEY, optional ELEVENLABS_VOICE_ID / ELEVENLABS_MODEL)
//   2. Groq Orpheus: Troy, then Austin, then Daniel (same GROQ_API_KEY as the rest of Luxe)
//   3. the phone's own voice, which the app itself switches to when this route answers 502
// A voice that is out of credits or rate-limited is left alone for a while, so a line does not flip between voices.
// Nothing is stored; the phone keeps a short memory of what it already fetched.
//
// POST { text, voice, tone } → audio (mp3 from ElevenLabs, wav from Groq) + header X-Byte-Voice: eleven | troy | austin | daniel
// voice: 'auto' (ElevenLabs first), or 'troy' | 'austin' | 'daniel' to start with that Groq voice. Text over 190 characters is cut.
import { requireUser } from '../../lib/require-user';

export const config = { maxDuration: 30 };
const GROQ_VOICES = ['troy', 'austin', 'daniel'];
const TONES = ['cheerful', 'friendly', 'warm', 'professional', 'calm', 'excited', 'whisper', 'dramatic'];
const GROQ_MODEL = process.env.GROQ_TTS_MODEL || 'canopylabs/orpheus-v1-english';
const EL_VOICE = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB'; // "Adam", a deep male voice every free account can use
const EL_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5'; // half the credits per character of the older models

// Best-effort memory of what is out of action (lasts as long as this server instance stays warm).
const down = { eleven: 0, groq: 0 };
let elevenWhy = ''; // the last reason ElevenLabs gave for not answering (sent back so the app can show it)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function viaEleven(text, tone) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key || Date.now() < down.eleven) return null;
  const stability = tone === 'excited' || tone === 'dramatic' ? 0.35 : tone === 'calm' || tone === 'professional' ? 0.65 : 0.5;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${EL_VOICE}?output_format=mp3_44100_64`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg', 'xi-api-key': key },
        body: JSON.stringify({ text, model_id: EL_MODEL, voice_settings: { stability, similarity_boost: 0.75, use_speaker_boost: true } }),
        signal: AbortSignal.timeout(12000),
      });
      if (r.ok) return { buf: Buffer.from(await r.arrayBuffer()), type: 'audio/mpeg', who: 'eleven' };
      const d = await r.json().catch(() => ({}));
      const why = d?.detail?.status || d?.detail?.message || '';
      elevenWhy = `${r.status} ${why}`.trim().slice(0, 120);
      if (r.status === 429 && attempt < 3) { await sleep([700, 1300, 2200][attempt]); continue; } // busy: the free plan allows 2 requests at once
      // Out of credits, blocked (ElevenLabs sometimes refuses free keys used from a server) or a bad key: rest it for a while.
      if (r.status === 401 || r.status === 402 || r.status === 403) down.eleven = Date.now() + (/quota/i.test(why) ? 60 : 10) * 60000;
      else down.eleven = Date.now() + (r.status === 429 ? 5000 : 20000);
      console.warn('[fedha] byte-voice elevenlabs failed:', r.status, why);
      return null;
    } catch (e) {
      down.eleven = Date.now() + 10000;
      elevenWhy = e.message.slice(0, 120);
      console.warn('[fedha] byte-voice elevenlabs error:', e.message);
      return null;
    }
  }
  return null;
}

async function viaGroq(text, tone, order) {
  const key = process.env.GROQ_API_KEY;
  if (!key || Date.now() < down.groq) return null;
  for (const voice of order) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/audio/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: GROQ_MODEL, voice, input: tone ? `[${tone}] ${text}` : text, response_format: 'wav' }),
        signal: AbortSignal.timeout(20000),
      });
      if (r.ok) return { buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type') || 'audio/wav', who: voice };
      const d = await r.json().catch(() => ({}));
      console.warn('[fedha] byte-voice groq failed:', voice, r.status, d.error?.message);
      if (r.status === 429) { down.groq = Date.now() + 20000; return null; } // the limit is shared by all three voices
    } catch (e) {
      console.warn('[fedha] byte-voice groq error:', voice, e.message);
    }
  }
  return null;
}

// GET /api/byte-voice?check=1 — voice health, without secrets: is the ElevenLabs key set, and what does ElevenLabs answer
// for one word? Cached 10 minutes so it can't burn credits.
let checked = null;
async function health() {
  if (checked && Date.now() - checked.at < 600000) return checked;
  const key = process.env.ELEVENLABS_API_KEY;
  const out = { at: Date.now(), elevenKey: !!key, keyLength: key ? key.length : 0, voice: EL_VOICE, model: EL_MODEL, groqKey: !!process.env.GROQ_API_KEY };
  if (key) {
    try {
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${EL_VOICE}?output_format=mp3_22050_32`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'xi-api-key': key }, body: JSON.stringify({ text: 'Hi.', model_id: EL_MODEL }), signal: AbortSignal.timeout(12000) });
      out.elevenStatus = r.status;
      if (!r.ok) { const d = await r.json().catch(() => ({})); out.elevenError = String(d?.detail?.status || '') + ' ' + String(d?.detail?.message || JSON.stringify(d).slice(0, 200)); }
    } catch (e) { out.elevenError = e.message; }
  }
  checked = out;
  return out;
}

export default async function handler(req, res) {
  if (req.method === 'GET' && req.query?.check) { const h = await health(); res.setHeader('Cache-Control', 'no-store'); return res.status(200).json({ ...h, at: undefined }); }
  if (!(await requireUser(req, res))) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ELEVENLABS_API_KEY && !process.env.GROQ_API_KEY) return res.status(500).json({ error: 'No voice key set (ELEVENLABS_API_KEY or GROQ_API_KEY)' });
  const text = String(req.body?.text || '').replace(/[*_#`[\]<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 190);
  if (!text) return res.status(400).json({ error: 'Nothing to say' });
  const pick = GROQ_VOICES.includes(req.body?.voice) ? req.body.voice : null; // null = auto
  const onlyEleven = req.body?.voice === 'eleven'; // ElevenLabs or nothing (the app then uses the phone, never Groq)
  const tone = TONES.includes(req.body?.tone) ? req.body.tone : '';
  const order = pick ? [pick, ...GROQ_VOICES.filter((v) => v !== pick)] : GROQ_VOICES;

  if (onlyEleven) down.eleven = 0; // chosen on purpose: always give it a real try
  const got = (!pick && (await viaEleven(text, tone))) || (onlyEleven ? null : await viaGroq(text, tone, order));
  if (!got) { res.setHeader('X-Byte-Why', elevenWhy || 'none'); return res.status(502).json({ error: 'Voice failed', eleven: elevenWhy }); }
  if (got.who !== 'eleven' && elevenWhy) res.setHeader('X-Byte-Why', elevenWhy);
  res.setHeader('Content-Type', got.type);
  res.setHeader('X-Byte-Voice', got.who);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  return res.status(200).send(got.buf);
}
