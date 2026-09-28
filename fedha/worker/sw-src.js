// Custom service worker source for Fedha.
// next-pwa (via workbox-webpack-plugin's InjectManifest mode) injects the
// precache manifest at the self.__WB_MANIFEST placeholder below and builds
// this file into public/sw.js.

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

self.skipWaiting();

// Claim clients only after activation. Keeping this here is important because
// a broken service worker means the entire offline layer disappears.
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ─── PRECACHE ────────────────────────────────────────────────────────────────
// Next-pwa injects the current build's JS/CSS/static assets here.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ─── OFFLINE PAGE / APP NAVIGATION ───────────────────────────────────────────
// Navigation requests are the important part of the PWA offline experience.
// Cache every Fedha page the user successfully visits. When offline, return
// that cached page immediately instead of waiting on a dead network request.
//
// This is deliberately separate from API requests: Supabase/Jarvis/nearby
// searches must never be allowed to block or break the local app.
registerRoute(
  new NavigationRoute(
    new NetworkFirst({
      cacheName: 'fedha-pages',
      networkTimeoutSeconds: 3,
      plugins: [
        new ExpirationPlugin({
          maxEntries: 50,
          maxAgeSeconds: 7 * 24 * 60 * 60,
        }),
      ],
    })
  )
);

// ─── STATIC ASSETS ────────────────────────────────────────────────────────────
// JS/CSS/fonts/images needed by already-visited pages should never disappear
// just because the user went offline.
registerRoute(
  ({ request }) =>
    ['script', 'style', 'font'].includes(request.destination),
  new CacheFirst({
    cacheName: 'fedha-static',
    plugins: [new ExpirationPlugin({ maxEntries: 250, maxAgeSeconds: 30 * 24 * 60 * 60 })],
  })
);

registerRoute(
  ({ request }) => request.destination === 'image',
  new StaleWhileRevalidate({
    cacheName: 'fedha-images',
    plugins: [new ExpirationPlugin({ maxEntries: 150, maxAgeSeconds: 30 * 24 * 60 * 60 })],
  })
);

// ─── ROOT START URL ──────────────────────────────────────────────────────────
// Keep the app entry point available even when the network disappears before
// the user has visited another page.
registerRoute(
  '/',
  new NetworkFirst({
    cacheName: 'start-url',
    networkTimeoutSeconds: 3,
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

// ─── OTHER SAME-ORIGIN GET REQUESTS ───────────────────────────────────────────
// Cache non-navigation GET resources as a fallback, but do NOT use the old
// catch-all /^https?.*/ route. That route also intercepted Supabase, Jarvis
// and third-party API calls, making live features look like app failures when
// offline and potentially serving stale API responses.
registerRoute(
  ({ request, url }) =>
    url.origin === self.location.origin &&
    request.method === 'GET' &&
    request.destination === '',
  new NetworkFirst({
    cacheName: 'fedha-data-pages',
    networkTimeoutSeconds: 3,
    plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 24 * 60 * 60 })],
  })
);

// ─── PUSH NOTIFICATIONS ─────────────────────────────────────────────────────
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
        // Nothing to do without a window to re-request permission from.
      }
    })()
  );
});
