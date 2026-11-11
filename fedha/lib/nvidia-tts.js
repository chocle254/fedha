// lib/nvidia-tts.js — NVIDIA Magpie TTS (build.nvidia.com, free: no monthly cap, about 40 requests a minute).
// It runs on NVIDIA's servers; Vercel only waits for the audio, so it costs almost no CPU.
// NVIDIA serves it over gRPC (Riva's speech API). This speaks gRPC directly with Node's built-in http2, so no extra
// package is needed: one request message in, raw 16-bit audio out, wrapped here in a WAV header.
// Settings: NVIDIA_API_KEY (already used by Tech Hub), optional NVIDIA_TTS_FUNCTION_ID, NVIDIA_TTS_VOICE, NVIDIA_TTS_DJ_VOICE.
import http2 from 'http2';

const HOST = 'https://grpc.nvcf.nvidia.com:443';
const FUNCTION_ID = process.env.NVIDIA_TTS_FUNCTION_ID || '877104f7-e885-42b9-8de8-f6e4c6303969'; // magpie-tts-multilingual
export const MAGPIE_VOICE = process.env.NVIDIA_TTS_VOICE || 'Magpie-Multilingual.EN-US.Jason';
export const MAGPIE_DJ_VOICE = process.env.NVIDIA_TTS_DJ_VOICE || 'Magpie-Multilingual.EN-US.Leo';
const RATE = 22050;

// ── tiny protobuf writer/reader (only what this one call needs) ──
function varint(n) { const out = []; while (n > 127) { out.push((n & 127) | 128); n >>>= 7; } out.push(n); return Buffer.from(out); }
const str = (field, s) => { const b = Buffer.from(s, 'utf8'); return Buffer.concat([varint((field << 3) | 2), varint(b.length), b]); };
const int = (field, n) => Buffer.concat([varint(field << 3), varint(n)]);
function readVarint(buf, i) { let n = 0; let shift = 0; let b; do { b = buf[i++]; n += (b & 127) * 2 ** shift; shift += 7; } while (b & 128); return [n, i]; }
function audioField(msg) { // SynthesizeSpeechResponse: field 1 = audio bytes
  let i = 0;
  while (i < msg.length) {
    let key; [key, i] = readVarint(msg, i);
    const field = key >>> 3; const type = key & 7;
    if (type === 2) { let len; [len, i] = readVarint(msg, i); if (field === 1) return msg.subarray(i, i + len); i += len; }
    else if (type === 0) [, i] = readVarint(msg, i);
    else if (type === 1) i += 8;
    else if (type === 5) i += 4;
    else break;
  }
  return Buffer.alloc(0);
}

function wav(pcm) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// Returns a WAV Buffer. Throws with NVIDIA's message (e.g. a wrong voice name or the rate limit).
export function magpieSpeak(text, { voice = MAGPIE_VOICE, timeout = 20000 } = {}) {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) return Promise.reject(new Error('NVIDIA_API_KEY not set'));
  // SynthesizeSpeechRequest: 1 text, 2 language_code, 3 encoding (1 = LINEAR_PCM), 4 sample_rate_hz, 5 voice_name
  const msg = Buffer.concat([str(1, text), str(2, 'en-US'), int(3, 1), int(4, RATE), str(5, voice)]);
  const frame = Buffer.alloc(5); frame.writeUInt32BE(msg.length, 1);
  return new Promise((resolve, reject) => {
    const client = http2.connect(HOST);
    let settled = false;
    const done = (err, val) => { if (settled) return; settled = true; clearTimeout(timer); client.close(); err ? reject(err) : resolve(val); };
    const timer = setTimeout(() => { client.destroy(); done(new Error('NVIDIA timed out')); }, timeout);
    client.on('error', (e) => done(e));
    const req = client.request({
      ':method': 'POST', ':path': '/nvidia.riva.tts.RivaSpeechSynthesis/Synthesize',
      'content-type': 'application/grpc', te: 'trailers',
      authorization: `Bearer ${key}`, 'function-id': FUNCTION_ID,
    });
    const chunks = [];
    let status = null; let message = '';
    const grab = (h) => { if (h['grpc-status'] != null) { status = Number(h['grpc-status']); message = decodeURIComponent(String(h['grpc-message'] || '')); } };
    req.on('response', (h) => { grab(h); if (h[':status'] && h[':status'] !== 200) message = message || `HTTP ${h[':status']}`; });
    req.on('trailers', grab);
    req.on('data', (c) => chunks.push(c));
    req.on('error', (e) => done(e));
    req.on('end', () => {
      if (status !== 0) return done(new Error(`NVIDIA ${status ?? '?'}: ${message || 'no answer'}`.slice(0, 200)));
      const body = Buffer.concat(chunks);
      const pcm = [];
      for (let i = 0; i + 5 <= body.length;) { const len = body.readUInt32BE(i + 1); pcm.push(audioField(body.subarray(i + 5, i + 5 + len))); i += 5 + len; }
      const audio = Buffer.concat(pcm);
      if (!audio.length) return done(new Error('NVIDIA sent no audio'));
      done(null, wav(audio));
    });
    req.end(Buffer.concat([frame, msg]));
  });
}
