// Real-time Telegram signal listener (READ ONLY: it never sends messages or places orders).
import 'dotenv/config';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';

const { TG_API_ID, TG_API_HASH, TG_SESSION, INGEST_URL, INGEST_SECRET } = process.env;
if (!TG_API_ID || !TG_API_HASH || !TG_SESSION || !INGEST_URL || !INGEST_SECRET) {
  console.error('Missing env vars. Copy .env.example to .env and fill it in (run `npm run login` for TG_SESSION).');
  process.exit(1);
}
const watch = (process.env.WATCH_GROUPS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

// Cheap pre-filter: anything that mentions a direction goes to the server, which parses it and logs what happened
// (so skipped messages show up in the Trading page inbox). NFKC turns "𝗦𝗘𝗟𝗟" fancy letters and "TP¹" into plain text.
function looksLikeSignal(t) {
  const up = t.normalize('NFKC').toUpperCase();
  return /\b(BUY|SELL|LONG|SHORT)\b/.test(up) && /\d/.test(up);
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

// Every minute, ask the site to check open paper trades so TP / SL / fill notifications arrive even when the page is closed.
const TICK_URL = process.env.TICK_URL || new URL('/api/trading/tick', INGEST_URL).toString();
async function tickTrades() {
  try {
    const r = await fetch(TICK_URL, { method: 'POST', headers: { 'x-ingest-secret': INGEST_SECRET }, signal: AbortSignal.timeout(25000) });
    if (!r.ok && r.status !== 404) console.warn('trade check failed: HTTP ' + r.status);
  } catch (e) { console.warn('trade check failed: ' + e.message); }
}
setInterval(tickTrades, 60000);

const client = new TelegramClient(new StringSession(TG_SESSION), Number(TG_API_ID), TG_API_HASH, { connectionRetries: Infinity, autoReconnect: true, useWSS: true });
await client.connect();
await client.invoke(new Api.updates.GetState()).catch((e) => console.warn('GetState failed: ' + e.message));
client.getDialogs({ limit: 300 }).then(() => console.log('Chats loaded')).catch((e) => console.warn('Could not load chats yet: ' + e.message)); // runs in the background so a slow connection cannot block startup
send({ heartbeat: true, stats: { seen: 0, forwarded: 0, watching: watch } }).catch(() => {});
console.log('Connected. Watching', watch.length ? watch.join(', ') : 'all groups and channels');

let seen = 0;
let forwarded = 0;
client.addEventHandler(async (event) => {
  try {
    const msg = event.message;
    if (msg) seen++;
    if (process.env.DEBUG !== '0' && msg) console.log('incoming:', 'group=' + event.isGroup, 'channel=' + event.isChannel, 'out=' + msg.out, JSON.stringify((msg.message || '').slice(0, 50)));
    if (!msg || (msg.out && process.env.ALLOW_OWN === '0')) return;
    if (!(event.isGroup || event.isChannel)) return;
    const text = msg.message || '';
    if (!looksLikeSignal(text)) return;
    const chat = await msg.getChat();
    const title = chat?.title || 'Telegram group';
    if (watch.length && !watch.some((w) => title.toLowerCase().includes(w))) return;
    forwarded++;
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
let ticks = 0;
setInterval(async () => {
  const mb = process.memoryUsage().rss / 1048576;
  if (mb > 350) { console.error('Memory at ' + Math.round(mb) + ' MB, restarting'); process.exit(1); }
  try {
    await Promise.race([client.invoke(new Api.updates.GetState()), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 20000))]);
    misses = 0;
    ticks++;
    if (ticks % 5 === 0) {
      console.log(new Date().toISOString(), 'alive | messages seen', seen, '| forwarded', forwarded);
      send({ heartbeat: true, stats: { seen, forwarded, watching: watch } }).catch(() => {});
    }
  } catch (e) {
    misses++;
    console.warn('Telegram not answering (' + misses + '/3): ' + e.message);
    if (misses >= 3) { console.error('Restarting listener'); process.exit(1); }
  }
}, 60000);
process.on('unhandledRejection', (e) => console.error('unhandled:', e && e.message ? e.message : e));
