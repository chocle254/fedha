// Real Web Push subscription + sync.
//
// This is what actually makes notifications fire when the app is closed:
// the browser registers a PushSubscription with the browser vendor's push
// service (Chrome/Firefox/Edge's own servers — free, no account needed),
// we hand that subscription to Supabase, and a scheduled Edge Function
// sends messages to it directly. lib/notifications.js's setTimeout-based
// scheduling still works for while the app is open/foregrounded, but this
// is the piece that covers "app fully closed."

import { supabase, isSupabaseEnabled } from './supabase';

// Your VAPID public key. Safe to expose client-side — this is the
// counterpart to the private key kept secret in the Edge Function's
// environment variables. See PUSH_SETUP.md for where this came from.
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    !!VAPID_PUBLIC_KEY
  );
}

// Call after Notification permission has been granted. Idempotent — safe to
// call on every app load; it reuses the existing subscription if present.
export async function ensurePushSubscription() {
  if (!pushSupported()) return null;

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    await saveSubscription(sub);
    return sub;
  } catch (e) {
    console.warn('[fedha] push subscription failed:', e?.message);
    return null;
  }
}

// Upserts the subscription into Supabase, keyed by its unique endpoint URL.
// Returns the row id, which reminder_settings links against.
async function saveSubscription(sub) {
  if (!isSupabaseEnabled()) return null;
  const json = sub.toJSON();

  const { data, error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    )
    .select('id')
    .single();

  if (error) {
    console.warn('[fedha] failed to save push subscription:', error.message);
    return null;
  }
  return data?.id ?? null;
}

// Mirrors the reminder-relevant settings (meal plan, planner blocks, the
// notifications toggle) to Supabase so the server-side Edge Function has
// something to read — it has no access to this browser's IndexedDB.
// Call this whenever those settings change, and once on app load.
export async function syncReminderSettings({ mealWeekPlan, plannerBlocks, plannerNotifs }) {
  if (!isSupabaseEnabled()) return;

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return; // nothing to link the settings to yet

    const subId = await saveSubscription(sub);
    if (!subId) return;

    const { error } = await supabase.from('reminder_settings').upsert(
      {
        push_subscription_id: subId,
        meal_week_plan: mealWeekPlan ?? null,
        planner_blocks: plannerBlocks ?? null,
        planner_notifs: !!plannerNotifs,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'push_subscription_id' }
    );
    if (error) console.warn('[fedha] failed to sync reminder settings:', error.message);
  } catch (e) {
    console.warn('[fedha] syncReminderSettings failed:', e?.message);
  }
}

// Listens for the service worker telling us a subscription was rotated
// (see pushsubscriptionchange in worker/sw-src.js) and re-saves it.
export function listenForSubscriptionRotation() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGED' && event.data.subscription) {
      saveSubscription(event.data.subscription);
    }
  });
}
