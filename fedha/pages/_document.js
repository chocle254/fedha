import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta charSet="utf-8" />
        <meta name="application-name" content="Luxe" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Luxe" />
        <meta name="description" content="Personal finance, meals, workouts and daily planner" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#040507" />

        {/* Favicon */}
        <link rel="icon" type="image/svg+xml" href="/icon.svg" />
        <link rel="alternate icon" href="/icon.svg" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="mask-icon" href="/icon.svg" color="#C4B5FD" />

        {/* PWA manifest */}
        <link rel="manifest" href="/manifest.json" />

        {/* First paint: the intro's midnight backdrop, before any script loads, so opening the app goes
            splash -> midnight -> intro with no flash of a blank or differently coloured page. */}
        <style dangerouslySetInnerHTML={{ __html: `
          html{background:#040507}
          #lx-boot{position:fixed;inset:0;z-index:2147482999;pointer-events:none;
            background:radial-gradient(120% 90% at 50% 38%,#1B1830 0%,#0A0912 45%,#040507 100%);
            transition:opacity .45s ease;animation:lxBootOut .4s 8s forwards}
          #lx-boot.lx-gone{opacity:0}
          @keyframes lxBootOut{to{opacity:0;visibility:hidden}}
        ` }} />
      </Head>
      <body>
        <div id="lx-boot" />
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
