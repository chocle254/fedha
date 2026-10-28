import { requireUser } from '../../../lib/require-user';
import { getTeamChats, unlinkTeamChat, sendTelegram } from '../../../lib/team-telegram';

// GET: the Telegram team groups linked to the bot. POST { chat_id, text }: the mentor posts to one of them.
// DELETE { chat_id }: unlink a group. Only groups linked with /link can receive messages.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = await requireUser(req, res);
  if (!user) return;
  const ownerId = process.env.SIGNAL_OWNER_USER_ID || user.id;
  if (req.method === 'GET') {
    return res.status(200).json({ chats: await getTeamChats(ownerId), bot: process.env.TELEGRAM_BOT_USERNAME || null, configured: !!process.env.TELEGRAM_BOT_TOKEN });
  }
  const { chat_id: chatId, text } = req.body || {};
  if (req.method === 'DELETE') { await unlinkTeamChat(ownerId, chatId); return res.status(200).json({ ok: true }); }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!String(text || '').trim()) return res.status(400).json({ error: 'Nothing to send.' });
  const chats = await getTeamChats(ownerId);
  if (!chats.some((c) => String(c.id) === String(chatId))) return res.status(403).json({ error: 'That group is not linked. Send /link in the group first.' });
  try {
    await sendTelegram(chatId, String(text).slice(0, 12000));
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
