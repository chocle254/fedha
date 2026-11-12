// Real-time Telegram signal listener (READ ONLY: it never sends messages or places orders).
import 'dotenv/config';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';
import { EditedMessage } from 'telegram/events/EditedMessage.js';
import { Raw } from 'telegram/events/index.js';
import { UpdateConnectionState, ConnectionTCPObfuscated, ConnectionTCPFull } from 'telegram/network/index.js';
import { readFileSync, writeFileSync } from 'node:fs';

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
        signal: AbortSignal.timeout(60000) // the Coach reviews each signal first (a few seconds)
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
// How often depends on what's happening (saves Vercel CPU on the free plan). From 30 days of signals:
// almost all arrive Mon-Fri 04:00-19:00 Kenya time; weekends are near silent (forex and gold are shut).
//   trades open or waiting: 1 min in busy hours, 3 min otherwise
//   nothing open:           5 min in busy hours, 15 min at night, 30 min at the weekend
//   a signal just came in:  check 10 s later so its trade fills on time
const MIN = 60000;
function nextTickMs(live) {
  const eat = new Date(Date.now() + 3 * 3600000); // Kenya time (UTC+3, no daylight saving)
  const h = eat.getUTCHours();
  const d = eat.getUTCDay(); // 0 Sun ... 6 Sat
  const weekend = (d === 6 && h >= 1) || d === 0 || (d === 1 && h < 1);
  const busy = !weekend && h >= 4 && h < 19;
  if (live > 0) return busy ? MIN : 3 * MIN;
  return weekend ? 30 * MIN : busy ? 5 * MIN : 15 * MIN;
}
let tickTimer = null;
function scheduleTick(ms) { clearTimeout(tickTimer); tickTimer = setTimeout(tickTrades, ms); }
async function tickTrades() {
  let live = 1; // if the check fails, assume trades are open and retry soon
  try {
    const r = await fetch(TICK_URL, { method: 'POST', headers: { 'x-ingest-secret': INGEST_SECRET }, signal: AbortSignal.timeout(25000) });
    if (r.ok) live = Number((await r.json().catch(() => ({}))).checked ?? 1);
    else if (r.status !== 404) console.warn('trade check failed: HTTP ' + r.status);
  } catch (e) { console.warn('trade check failed: ' + e.message); }
  scheduleTick(nextTickMs(live));
}
scheduleTick(5000);

// Obfuscated transport (what the official Telegram app uses): plain MTProto is easy for mobile networks to spot
// and throttle, which made the listener only connect over a VPN. TG_TRANSPORT=full switches back to the old one.
const connection = process.env.TG_TRANSPORT === 'full' ? ConnectionTCPFull : ConnectionTCPObfuscated;
const client = new TelegramClient(new StringSession(TG_SESSION), Number(TG_API_ID), TG_API_HASH, { connection, connectionRetries: Infinity, autoReconnect: true });
await client.connect();
await client.invoke(new Api.updates.GetState()).catch((e) => console.warn('GetState failed: ' + e.message));
client.getDialogs({ limit: 300 }).then(() => console.log('Chats loaded')).catch((e) => console.warn('Could not load chats yet: ' + e.message)); // runs in the background so a slow connection cannot block startup
send({ heartbeat: true, stats: { seen: 0, forwarded: 0, watching: watch } }).catch(() => {});
console.log('Connected. Watching', watch.length ? watch.join(', ') : 'all groups and channels');

let seen = 0;
let forwarded = 0;
// Message ids already handled, so the live feed and the backup poll never send the same post twice.
const handled = new Set();
// chat id -> newest message id we have looked at. Saved to disk so a restart catches up on posts
// made while the listener was down instead of starting from "now" and missing them.
const LAST_ID_FILE = new URL('./last-ids.json', import.meta.url);
const lastId = new Map();
try {
  const saved = JSON.parse(readFileSync(LAST_ID_FILE, 'utf8'));
  // Only catch up after a short outage (30 min); after a long one, old signals are stale, so start fresh.
  if (Date.now() - saved.savedAt < 30 * 60 * 1000) for (const [k, v] of Object.entries(saved.ids || {})) lastId.set(k, Number(v));
} catch {}
function saveLastIds() {
  try { writeFileSync(LAST_ID_FILE, JSON.stringify({ savedAt: Date.now(), ids: Object.fromEntries(lastId) })); } catch (e) { console.warn('could not save last ids: ' + e.message); }
}
// Any Telegram call can hang forever on a dead connection; never let one freeze the backup poll.
function withTimeout(p, ms, what) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what + ' timed out')), ms))]);
}

// Shared by the live feed and the backup poll.
// edited: the channel changed the post (many post "GOLD SELL 4057" first and add SL / TPs a few seconds later).
// The edit is sent with the SAME id, so Luxe never trades one post twice: if the first version already became a
// signal, the edit is a duplicate; if it was missing its levels, the edit is the one that gets traded.
async function forward({ chatId, id, date, text, title, edited = false }) {
  const key = `${chatId}:${id}`;
  const seenKey = edited ? `${key}:${text.length}:${text.slice(-24)}` : key;
  if (handled.has(seenKey)) return;
  handled.add(seenKey);
  if (handled.size > 5000) handled.delete(handled.values().next().value);
  if (Number(id) > (lastId.get(String(chatId)) || 0)) lastId.set(String(chatId), Number(id));
  if (!looksLikeSignal(text)) return;
  if (watch.length && !watch.some((w) => title.toLowerCase().includes(w))) return;
  forwarded++;
  const out = await send({ source: title, text, externalId: key, messageDate: new Date(date * 1000).toISOString(), edited });
  console.log(new Date().toISOString(), title, '->', out ? JSON.stringify(out) : 'failed');
  if (out) scheduleTick(10000); // new signal: check its trade soon instead of waiting for the slow timer
}

client.addEventHandler(async (event) => {
  try {
    const msg = event.message;
    if (msg) seen++;
    if (process.env.DEBUG !== '0' && msg) console.log('incoming:', 'group=' + event.isGroup, 'channel=' + event.isChannel, 'out=' + msg.out, JSON.stringify((msg.message || '').slice(0, 50)));
    if (!msg || (msg.out && process.env.ALLOW_OWN === '0')) return;
    if (!(event.isGroup || event.isChannel)) return;
    const text = msg.message || '';
    if (!looksLikeSignal(text)) { handled.add(`${msg.chatId}:${msg.id}`); return; }
    const chat = await msg.getChat();
    await forward({ chatId: msg.chatId, id: msg.id, date: msg.date, text, title: chat?.title || 'Telegram group' });
  } catch (e) {
    console.error('handler error:', e.message);
  }
}, new NewMessage({}));

// Edited posts: only within 20 minutes of the original (later edits are usually "TP1 hit ✅" results).
client.addEventHandler(async (event) => {
  try {
    const msg = event.message;
    if (!msg || (msg.out && process.env.ALLOW_OWN === '0')) return;
    if (!(event.isGroup || event.isChannel)) return;
    const text = msg.message || '';
    if (!looksLikeSignal(text)) return;
    if (Date.now() / 1000 - Number(msg.date) > 20 * 60) return;
    const chat = await msg.getChat();
    await forward({ chatId: msg.chatId, id: msg.id, date: msg.editDate || Math.floor(Date.now() / 1000), text, title: chat?.title || 'Telegram group', edited: true });
  } catch (e) {
    console.error('edit handler error:', e.message);
  }
}, new EditedMessage({}));

// BACKUP POLL: Telegram's live feed silently skips posts from some channels (busy ones, or ones the
// account rarely opens, including "restrict saving content" channels). Every 45 s, look at the newest
// message in each group/channel and fetch anything we have not handled yet.
const POLL_MS = Number(process.env.POLL_MS || 45000);
let polling = false;
async function pollChats() {
  if (polling) return;
  polling = true;
  try {
    // All chats (not just the 200 most recent), so a quiet channel's post can't slip past.
    const dialogs = await withTimeout(client.getDialogs({ limit: 1000 }), 30000, 'chat list');
    for (const d of dialogs) {
      if (!(d.isGroup || d.isChannel) || !d.message) continue;
      const chatId = String(d.id);
      const top = Number(d.message.id);
      const known = lastId.get(chatId);
      if (known == null) { lastId.set(chatId, top); continue; } // brand-new chat: start from now, no backlog
      if (top <= known) continue;
      const title = d.title || 'Telegram group';
      if (watch.length && !watch.some((w) => title.toLowerCase().includes(w))) { lastId.set(chatId, top); continue; }
      const msgs = await withTimeout(client.getMessages(d.entity, { minId: known, limit: 20 }), 20000, 'messages');
      for (const m of [...msgs].reverse()) {
        if (!m || (m.out && process.env.ALLOW_OWN === '0')) continue;
        seen++;
        await forward({ chatId: m.chatId ?? d.id, id: m.id, date: m.date, text: m.message || '', title });
      }
      lastId.set(chatId, Math.max(top, lastId.get(chatId) || 0));
    }
  } catch (e) {
    const wait = e.seconds ? e.seconds * 1000 : 0; // FloodWait: back off as Telegram asks
    console.warn('backup poll failed: ' + e.message + (wait ? ` (waiting ${e.seconds}s)` : ''));
    if (wait) await new Promise((r) => setTimeout(r, wait));
  } finally {
    polling = false;
    saveLastIds();
  }
}
setTimeout(pollChats, 5000);

// The phone's connection to Telegram drops now and then; posts made during the gap never arrive on the
// live feed. As soon as the connection is back, run the backup poll so missed signals are fetched at once.
client.addEventHandler((u) => {
  if (u instanceof UpdateConnectionState && u.state === UpdateConnectionState.connected) {
    console.log(new Date().toISOString(), 'reconnected, checking for missed posts');
    setTimeout(pollChats, 1500);
  }
}, new Raw({}));
setInterval(pollChats, POLL_MS);

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
