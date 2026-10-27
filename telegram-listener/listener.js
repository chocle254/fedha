// Real-time Telegram signal listener (READ ONLY: it never sends messages or places orders).
import 'dotenv/config';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';

const { TG_API_ID, TG_API_HASH, TG_SESSION, INGEST_URL, INGEST_SECRET } = process.env;
if (!TG_API_ID || !TG_API_HASH || !TG_SESSION || !INGEST_URL || !INGEST_SECRET) {
  console.error('Missing env vars. Copy .env.example to .env and fill it in (run `npm run login` for TG_SESSION).');
  process.exit(1);
}
const watch = (process.env.WATCH_GROUPS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

// Cheap pre-filter so we only send messages that look like signals; the server does the real parsing.
function looksLikeSignal(t) {
  const up = t.toUpperCase();
  if (!/\b(BUY|SELL|LONG|SHORT)\b/.test(up)) return false;
  if (!/\b(TP\d*|TARGETS?|TAKE[\s-]*PROFIT|SL|STOP)\b/.test(up)) return false;
  // Result posts ("TP4 HIT", "120 PIPS DONE") are follow-ups, not new signals
  const followUp = /\b(HIT|DONE|REACHED|ACHIEVED|BOOKED|SMASHED)\b|TPS?\s*\d*\s*HIT|TPHIT|\bPIPS\b/.test(up);
  if (followUp && !/\b(ENTRY|ENTER|ENTRIES)\b|@/.test(up)) return false;
  return true;
}

async function send(payload) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(INGEST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ingest-secret': INGEST_SECRET },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000)
      });
      if (r.status === 401) { console.error('Ingest rejected the secret (401). Check INGEST_SECRET.'); return null; }
      return await r.json();
    } catch (e) {
      console.error('send failed, retrying:', e.message);
      await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
    }
  }
  return null;
}

const client = new TelegramClient(new StringSession(TG_SESSION), Number(TG_API_ID), TG_API_HASH, { connectionRetries: Infinity, autoReconnect: true, useWSS: true });
await client.connect();
client.getDialogs({ limit: 300 }).then(() => console.log('Chats loaded')).catch((e) => console.warn('Could not load chats yet: ' + e.message)); // runs in the background so a slow connection cannot block startup
console.log('Connected. Watching', watch.length ? watch.join(', ') : 'all groups and channels');

client.addEventHandler(async (event) => {
  try {
    const msg = event.message;
    if (process.env.DEBUG === '1' && msg) console.log('incoming:', 'group=' + event.isGroup, 'channel=' + event.isChannel, 'out=' + msg.out, JSON.stringify((msg.message || '').slice(0, 50)));
    if (!msg || (msg.out && process.env.ALLOW_OWN !== '1')) return;
    if (!(event.isGroup || event.isChannel)) return;
    const text = msg.message || '';
    if (!looksLikeSignal(text)) return;
    const chat = await msg.getChat();
    const title = chat?.title || 'Telegram group';
    if (watch.length && !watch.some((w) => title.toLowerCase().includes(w))) return;
    const out = await send({
      source: title,
      text,
      externalId: `${msg.chatId}:${msg.id}`,
      messageDate: new Date(msg.date * 1000).toISOString()
    });
    console.log(new Date().toISOString(), title, '->', out ? JSON.stringify(out) : 'failed');
  } catch (e) {
    console.error('handler error:', e.message);
  }
}, new NewMessage({}));

// Keep the process alive and make connection drops visible.
// WATCHDOG: restart cleanly if Telegram stops answering or memory balloons (start.sh relaunches us).
let misses = 0;
setInterval(async () => {
  const mb = process.memoryUsage().rss / 1048576;
  if (mb > 350) { console.error('Memory at ' + Math.round(mb) + ' MB, restarting'); process.exit(1); }
  try {
    await Promise.race([client.getMe(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 20000))]);
    misses = 0;
  } catch (e) {
    misses++;
    console.warn('Telegram not answering (' + misses + '/3): ' + e.message);
    if (misses >= 3) { console.error('Restarting listener'); process.exit(1); }
  }
}, 60000);
process.on('unhandledRejection', (e) => console.error('unhandled:', e && e.message ? e.message : e));
