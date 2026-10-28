import crypto from 'crypto';
import { createSignal } from '../../../lib/signals';
import { maybeAutoEnter } from '../../../lib/trading';
import { linkTeamChat, unlinkTeamChat } from '../../../lib/team-telegram';

// Forward a signal message from any Telegram group to your own bot and it is tracked here.
// Paper tracking only: no orders are placed.
function same(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

async function reply(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    });
  } catch {
    // Replies are best-effort.
  }
}

function sourceOf(msg) {
  const o = msg.forward_origin;
  if (o?.chat?.title) return o.chat.title;
  if (o?.sender_chat?.title) return o.sender_chat.title;
  if (o?.sender_user?.first_name) return o.sender_user.first_name;
  if (o?.sender_user_name) return o.sender_user_name;
  if (msg.forward_from_chat?.title) return msg.forward_from_chat.title;
  return 'Telegram (typed)';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || !same(req.headers['x-telegram-bot-api-secret-token'], secret)) return res.status(401).json({ error: 'Unauthorized' });

  const msg = req.body?.message;
  const owner = String(process.env.TELEGRAM_OWNER_CHAT_ID || '');
  const userId = process.env.SIGNAL_OWNER_USER_ID;
  // Team groups: the owner adds the bot to a group and sends /link there, so the hackathon and startup
  // mentors can post plans and updates to the team. Only the owner's /link or /unlink counts.
  const groupCmd = String(msg?.text || '').trim().toLowerCase().replace(/@\w+$/, '');
  if (msg && userId && owner && ['group', 'supergroup'].includes(msg.chat?.type) && String(msg.from?.id) === owner && ['/link', '/unlink'].includes(groupCmd.split(/\s/)[0])) {
    try {
      if (groupCmd.startsWith('/unlink')) {
        await unlinkTeamChat(userId, msg.chat.id);
        await reply(msg.chat.id, 'Unlinked. Luxe will not post here any more.');
      } else {
        await linkTeamChat(userId, { id: msg.chat.id, title: msg.chat.title });
        await reply(msg.chat.id, `Linked to Luxe. Your mentor can now post plans and updates to "${msg.chat.title || 'this group'}".`);
      }
    } catch (e) {
      await reply(msg.chat.id, `Could not link this group: ${e.message}`);
    }
    return res.status(200).json({ ok: true });
  }

  // Ignore anyone except you. Always answer 200 so Telegram does not retry.
  if (!msg || !owner || String(msg.chat?.id) !== owner || !userId) return res.status(200).json({ ok: true });

  const text = msg.text || msg.caption || '';
  if (text.startsWith('/start')) {
    await reply(msg.chat.id, 'Forward signal messages here and I will track them in Luxe (paper only, no real orders).');
    return res.status(200).json({ ok: true });
  }
  const result = await createSignal({ userId, source: sourceOf(msg), text });
  if (result.ok) await maybeAutoEnter(userId, result.signal);
  await reply(msg.chat.id, result.ok
    ? `Tracking ${result.signal.symbol} ${result.signal.side} from ${result.signal.source}`
    : `Could not read that signal: ${result.error}`);
  return res.status(200).json({ ok: true });
}
