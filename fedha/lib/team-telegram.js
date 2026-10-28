// Team channel: the mentor posts plans and updates to a Telegram group through Luxe's bot.
// Link a group by adding the bot to it and sending /link there (only the owner's /link counts).
// Linked chats are kept in the settings table under 'telegram_team_chats' (server side only).
import { supabaseAdmin } from './supabaseAdmin';

const KEY = 'telegram_team_chats';

export async function getTeamChats(userId) {
  const { data } = await supabaseAdmin.from('settings').select('value').eq('user_id', userId).eq('key', KEY).maybeSingle();
  return Array.isArray(data?.value) ? data.value : [];
}

async function saveTeamChats(userId, chats) {
  const { error } = await supabaseAdmin.from('settings').upsert({ user_id: userId, key: KEY, value: chats, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
  if (error) throw new Error(error.message);
}

export async function linkTeamChat(userId, chat) {
  const chats = (await getTeamChats(userId)).filter((c) => String(c.id) !== String(chat.id));
  chats.unshift({ id: String(chat.id), title: String(chat.title || 'Team').slice(0, 80), linked_at: new Date().toISOString() });
  await saveTeamChats(userId, chats.slice(0, 10));
}

export async function unlinkTeamChat(userId, chatId) {
  await saveTeamChats(userId, (await getTeamChats(userId)).filter((c) => String(c.id) !== String(chatId)));
}

// Telegram allows 4096 characters per message; long plans are split on line breaks.
export async function sendTelegram(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set.');
  const parts = [];
  let cur = '';
  for (const line of String(text).split('\n')) {
    if ((cur + '\n' + line).length > 3900) { parts.push(cur); cur = line; } else cur = cur ? `${cur}\n${line}` : line;
  }
  if (cur) parts.push(cur);
  for (const part of parts) {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: part, disable_web_page_preview: true }),
    });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error(j.description || 'Telegram did not accept the message.');
  }
}
