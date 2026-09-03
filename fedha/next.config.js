const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  // Use our own service worker source (adds push + notificationclick
  // handlers) instead of letting next-pwa auto-generate one from
  // runtimeCaching alone. Workbox's InjectManifest mode compiles this
  // into public/sw.js, injecting the precache list at build time — the
  // caching behavior below is preserved, just declared inside sw-src.js.
  swSrc: 'worker/sw-src.js',
});

module.exports = withPWA({
  reactStrictMode: true,
});
