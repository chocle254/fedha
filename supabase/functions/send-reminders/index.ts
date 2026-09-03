// Fedha — send-reminders Edge Function
//
// Triggered every minute by a pg_cron job (see supabase-push-schema.sql).
// For every device that has granted notification permission, checks
// whether any meal or planner reminder is due *right now* and, if so,
// sends a real Web Push message via the browser's push service — this
// works even if the Fedha tab/app is completely closed.
//
// Mirrors the same reminder rules as lib/notifications.js so the
// server-sent notifications match what the in-app scheduler would have
// shown while the app was open.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.0';
import webpush from 'https://esm.sh/web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ─── TIME HELPERS (server runs in UTC; reminder times are wall-clock local) ──
// Reminder times ("06:40" etc.) are meant in the user's local time. Since
// this function has no per-user timezone stored, it uses TZ_OFFSET_MINUTES
// (set as a secret, e.g. 180 for EAT/UTC+3) to convert. Adjust in Supabase
// dashboard → Edge Functions → send-reminders → Secrets if you're elsewhere.
const TZ_OFFSET_MINUTES = Number(Deno.env.get('TZ_OFFSET_MINUTES') ?? '180'); // default EAT (UTC+3)

function nowLocal(): Date {
  const now = new Date();
  return new Date(now.getTime() + TZ_OFFSET_MINUTES * 60000);
}

function hhmmToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function localDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// A reminder is "due" if the current local minute matches its target minute.
// The cron fires every 60s, so an exact-minute match is reliable enough
// without needing a range check.
function isDueNow(targetHHMM: string, nowMinsSinceMidnight: number): boolean {
  return hhmmToMinutes(targetHHMM) === nowMinsSinceMidnight;
}

// ─── MEAL REMINDER RULES (mirrors lib/notifications.js scheduleMealReminders) ─
const MEAL_SLOTS: Record<string, { prepTime: string | null; eatTime: string; label: string }> = {
  breakfast: { prepTime: '06:20', eatTime: '06:40', label: 'Breakfast' },
  snack: { prepTime: null, eatTime: '10:50', label: '10am Snack' },
  lunch: { prepTime: '13:00', eatTime: '13:25', label: 'Lunch' },
  dinner: { prepTime: '18:30', eatTime: '18:50', label: 'Dinner' },
};

function fmt12(t: string): string {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

type Notif = { key: string; title: string; body: string; requireInteraction?: boolean; vibrate?: number[] };

function buildMealNotifs(mealPlan: any, dayIdx: number, nowMins: number, dateKey: string): Notif[] {
  const todayMeals = mealPlan?.[dayIdx];
  if (!todayMeals) return [];
  const out: Notif[] = [];

  for (const [slot, times] of Object.entries(MEAL_SLOTS)) {
    const meal = todayMeals[slot];
    if (!meal) continue;

    if (times.prepTime && isDueNow(times.prepTime, nowMins)) {
      out.push({
        key: `meal_prep_${slot}_${dateKey}`,
        title: `🍳 Start cooking ${times.label} now`,
        body: `${meal.name} — ready by ${fmt12(times.eatTime)}. Ingredients: ${String(meal.ingredients).split(',')[0]}…`,
        requireInteraction: true,
        vibrate: [300, 100, 300, 100, 300],
      });
    }
    if (isDueNow(times.eatTime, nowMins)) {
      out.push({
        key: `meal_eat_${slot}_${dateKey}`,
        title: `🍽️ Time to eat ${times.label}!`,
        body: `${meal.name} — ${meal.cal} cal · ${meal.protein} protein`,
        vibrate: [200, 100, 200],
      });
    }
  }
  return out;
}

// ─── PLANNER REMINDER RULES (mirrors schedulePlannerReminders) ──────────────
function blockTitle(block: any): string {
  const titles: Record<string, string> = {
    meal: `🍽️ ${block.label}`,
    study: `📚 Study time — ${block.label}`,
    coding: `💻 Coding block — start now`,
    school: `🏫 ${block.label}`,
    routine: `⏰ ${block.label}`,
    personal: block.label?.toLowerCase().includes('bae') ? `💕 ${block.label}` : `🎧 ${block.label}`,
    sleep: `😴 Time to sleep`,
  };
  return titles[block.type] || `⏰ ${block.label}`;
}

function buildPlannerNotifs(blocks: any[], nowMins: number, dateKey: string): Notif[] {
  if (!blocks?.length) return [];
  const out: Notif[] = [];

  for (const block of blocks) {
    const blockMins = hhmmToMinutes(block.time);

    if (isDueNow(block.time, nowMins)) {
      out.push({
        key: `block_${block.id}_${dateKey}`,
        title: blockTitle(block),
        body: block.note,
        requireInteraction: ['study', 'coding', 'sleep', 'meal'].includes(block.type),
      });
    }

    if (block.type === 'meal' && block.label?.includes('Eat')) {
      const warnMins = blockMins - 25;
      if (warnMins > 0 && isDueNow(minutesToHHMM(warnMins), nowMins)) {
        out.push({
          key: `block_warn_${block.id}_${dateKey}`,
          title: `🍳 Start cooking in 25 min`,
          body: `Prepare ${block.label.replace('Eat ', '')} now so it's ready by ${fmt12(block.time)}`,
          requireInteraction: true,
          vibrate: [300, 100, 300, 100, 300],
        });
      }
    }

    if (block.type === 'school') {
      const warnMins = blockMins - 12;
      if (warnMins > 0 && isDueNow(minutesToHHMM(warnMins), nowMins)) {
        out.push({
          key: `block_walk_${block.id}_${dateKey}`,
          title: `🚶 Leave for school NOW`,
          body: `10-min walk — arrive by ${fmt12(block.time)}. Pack your bag.`,
          requireInteraction: true,
          vibrate: [500, 100, 500, 100, 500, 100, 500],
        });
      }
    }

    if (block.type === 'sleep') {
      const warnMins = blockMins - 30;
      if (warnMins > 0 && isDueNow(minutesToHHMM(warnMins), nowMins)) {
        out.push({
          key: `block_sleep_warn_${block.id}_${dateKey}`,
          title: `🌙 Wind down — sleep in 30 mins`,
          body: 'Put the phone down. Prepare for bed. 9 hours = max muscle growth.',
        });
      }
    }

    if (['study', 'coding'].includes(block.type)) {
      const warnMins = blockMins - 5;
      if (warnMins > 0 && isDueNow(minutesToHHMM(warnMins), nowMins)) {
        out.push({
          key: `block_5min_${block.id}_${dateKey}`,
          title: `⚠️ ${block.label} in 5 minutes`,
          body: 'Put your phone down and get ready. Phone goes in another room.',
        });
      }
    }
  }
  return out;
}

function minutesToHHMM(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
Deno.serve(async () => {
  const now = nowLocal();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const dateKey = localDateKey(now);
  const dayIdx = now.getDay() === 0 ? 6 : now.getDay() - 1; // 0=Mon..6=Sun, matches lib/utils.js convention

  const { data: settingsRows, error } = await supabase
    .from('reminder_settings')
    .select('push_subscription_id, meal_week_plan, planner_blocks, planner_notifs, push_subscriptions(endpoint, p256dh, auth)');

  if (error) {
    console.error('Failed to load reminder_settings:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  let sent = 0;
  let skipped = 0;

  for (const row of settingsRows ?? []) {
    const sub = (row as any).push_subscriptions;
    if (!sub) continue;

    const notifs: Notif[] = [
      ...buildMealNotifs(row.meal_week_plan, dayIdx, nowMins, dateKey),
      ...(row.planner_notifs ? buildPlannerNotifs(row.planner_blocks, nowMins, dateKey) : []),
    ];
    if (!notifs.length) continue;

    for (const n of notifs) {
      // Dedupe: skip if we've already sent this exact reminder today.
      const { error: logError } = await supabase
        .from('push_sent_log')
        .insert({ push_subscription_id: row.push_subscription_id, reminder_key: n.key });

      if (logError) {
        // Unique violation means it was already sent — expected, not a bug.
        skipped++;
        continue;
      }

      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({
            title: n.title,
            body: n.body,
            requireInteraction: !!n.requireInteraction,
            vibrate: n.vibrate ?? [200, 100, 200],
            url: '/planner',
          })
        );
        sent++;
      } catch (err: any) {
        // 404/410 means the subscription is gone (user revoked permission,
        // uninstalled, cleared browsing data) — clean it up so we stop
        // trying to send to a dead endpoint every minute.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', row.push_subscription_id);
        } else {
          console.error('Push send failed:', err?.message || err);
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, skipped }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
