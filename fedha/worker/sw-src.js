// Custom service worker source for Fedha.
// next-pwa (via workbox-webpack-plugin's InjectManifest mode) injects the
// precache manifest at the self.__WB_MANIFEST placeholder below and builds
// this file into public/sw.js. Do NOT edit public/sw.js directly — it's
// regenerated on every `next build` and any manual edits will be lost.

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

self.skipWaiting();

// clients.claim() is only valid once this worker has finished activating —
// calling it eagerly at script-evaluation time (before 'activate' fires)
// throws "InvalidStateError: Only the active worker can claim clients."
// which crashed the whole service worker on load, breaking push
// subscription persistence along with everything else.
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ─── PRECACHING (unchanged behavior from the old generated sw.js) ──────────
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(
  '/',
  new NetworkFirst({
    cacheName: 'start-url',
    plugins: [
      {
        cacheWillUpdate: async ({ response }) =>
          response && response.type === 'opaqueredirect'
            ? new Response(response.body, { status: 200, statusText: 'OK', headers: response.headers })
            : response,
      },
    ],
  }),
  'GET'
);

registerRoute(
  /^https?.*/,
  new NetworkFirst({
    cacheName: 'fedha-cache',
    networkTimeoutSeconds: 10,
    plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 86400 })],
  }),
  'GET'
);

// ─── PUSH NOTIFICATIONS ─────────────────────────────────────────────────────
// Fired when a push message arrives from the server, even if Fedha isn't
// open in any tab. This is what makes notifications work when the app is
// closed — the old generated sw.js had no listener for this event at all.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Fedha', body: event.data ? event.data.text() : '' };
  }

  const {
    title = 'Fedha',
    body = '',
    icon = '/icon.svg',
    badge = '/icon.svg',
    tag,
    requireInteraction = false,
    vibrate = [200, 100, 200],
    url = '/',
    actions = [],
  } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag,
      requireInteraction,
      vibrate,
      actions,
      data: { url },
    })
  );
});

// ─── NOTIFICATION CLICK ──────────────────────────────────────────────────────
// Focuses an existing Fedha tab if one is open, otherwise opens a new one,
// navigating to the URL the push payload specified.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const clientPath = new URL(client.url).pathname;
        if (clientPath === targetUrl && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

// ─── SUBSCRIPTION EXPIRY / ROTATION ──────────────────────────────────────────
// Browsers occasionally invalidate a push subscription and fire this event
// with a replacement. Re-register it with Supabase so reminders keep working
// without the user having to reopen the app and re-grant permission.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const newSub =
          event.newSubscription ||
          (await self.registration.pushManager.subscribe(event.oldSubscription?.options || { userVisibleOnly: true }));
        const clientList = await self.clients.matchAll({ type: 'window' });
        clientList.forEach((client) => client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED', subscription: newSub }));
      } catch (e) {
        // Nothing we can do without a window to re-request permission from.
      }
    })()
  );
});
