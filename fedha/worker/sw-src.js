// Custom service worker source for Luxe.
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

// ─── APP FILES (/_next/static) ───────────────────────────────────────────────
// Registered BEFORE the precache route so it wins. Every build file the app loads is kept here (names are hashed,
// so they never go stale). Without this, each update deleted the previous build's files from the precache, while
// pages saved for offline still pointed at them: offline, the page loaded but its code did not (blank screen).
// On a miss with no network, fall back to any cache that has it (the precache stores it with a revision query).
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/_next/static/'),
  new CacheFirst({
    cacheName: 'fedha-next',
    plugins: [
      new ExpirationPlugin({ maxEntries: 600, maxAgeSeconds: 45 * 24 * 60 * 60 }),
      { handlerDidError: async ({ request }) => (await caches.match(request.url, { ignoreSearch: true })) || undefined },
    ],
  })
);

// ─── PRECACHE ────────────────────────────────────────────────────────────────
// Next-pwa injects the current build's JS/CSS/static assets here.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ─── OFFLINE PAGE / APP NAVIGATION ───────────────────────────────────────────
// Navigation requests are the important part of the PWA offline experience.
// Cache every Luxe page the user successfully visits. When offline, return
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
        // Offline and this exact page was never saved (or was saved with a different ?query): serve the same page
        // without the query, else the home page, so the app still opens and its own router takes over.
        {
          handlerDidError: async ({ request }) => {
            const u = new URL(request.url);
            return (await caches.match(u.origin + u.pathname, { ignoreSearch: true }))
              || (await caches.match(u.origin + '/', { ignoreSearch: true }))
              || undefined;
          },
        },
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
    payload = { title: 'Luxe', body: event.data ? event.data.text() : '' };
  }

  const {
    title = 'Luxe',
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
    (async () => {
      // The open app's own timer may have shown this exact reminder already
      // (same tag). Replace it silently instead of buzzing a second time —
      // Chrome still needs a notification shown for every push.
      // planner_live~… is the pinned live planner card: the Android app draws it itself; anywhere else it is a
      // quiet duplicate of the block reminder, so never let it buzz.
      const already = (tag ? (await self.registration.getNotifications({ tag })).length > 0 : false) || String(tag || '').startsWith('planner_live~');
      // Luxe is open and in front: it shows its own in-app banner (with sound), and the system copy goes quietly
      // to the shade ("~quiet" tells the Android app not to draw its pop-up as well).
      const live = String(tag || '').startsWith('planner_live~');
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const front = live ? null : wins.find((c) => c.visibilityState === 'visible' && c.focused);
      if (front) front.postMessage({ type: 'LUXE_PUSH', payload: { title, body, tag, url } });
      await self.registration.showNotification(title, {
        body,
        icon,
        badge,
        tag: front ? `${tag || 'luxe'}~quiet` : tag,
        requireInteraction,
        vibrate: already || front ? undefined : vibrate,
        silent: already || !!front,
        actions,
        data: { url },
      });
    })()
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
