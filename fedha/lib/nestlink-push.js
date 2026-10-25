// Server-side Web Push to every device subscribed in Fedha (single-user app).
// Reuses the push_subscriptions table and the VAPID keys already used by reminders.
import webpush from 'web-push';

export async function pushToAll({ title, body, tag, url = '/utilities' }) {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { sent: 0, skipped: 'push not configured' };

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://fedha.vercel.app', pub, priv);
  const { supabaseAdmin } = await import('./supabaseAdmin');
  const { data: subs, error } = await supabaseAdmin.from('push_subscriptions').select('id,endpoint,p256dh,auth');
  if (error) throw new Error(`Could not read push subscriptions: ${error.message}`);

  let sent = 0;
  for (const sub of subs || []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title, body, tag, url, vibrate: [200, 100, 200] }),
        { TTL: 3600 }
      );
      sent++;
    } catch (err) {
      // 404/410: the device unsubscribed or was wiped, so drop it.
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id);
      } else {
        console.error('[fedha] NestLink push failed:', err?.statusCode || '', err?.message || err);
      }
    }
  }
  return { sent };
}
