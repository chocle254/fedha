import { useEffect } from 'react';
import { useRouter } from 'next/router';

// Keeps Luxe cool on the phone. Invisible; switches two classes on <html> (styles/globals.css):
//   lx-still  background motion (tier particles, holiday scenes, the tier shine) plays for a few seconds when a
//             page opens, then freezes on a nice frame. It also freezes while you scroll. Moving layers drawn all
//             the time were the main thing keeping the GPU busy and the phone warm.
//   lx-saver  battery low and not charging (30 % or less, or 15 % or less even when charging): no background
//             motion at all and slower live counters. Says so once when it turns on.
// Also, once a week at most: a tip about using bypass charging when Luxe is busy on the charger.
const PLAY_MS = 8000;

export default function PowerSaver() {
  const router = useRouter();

  // Motion plays after each page change, then stops.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('lx-still');
    const t = setTimeout(() => root.classList.add('lx-still'), PLAY_MS);
    return () => clearTimeout(t);
  }, [router.asPath]);

  // Scrolling: freeze straight away (smooth scrolling beats moving decorations).
  useEffect(() => {
    const root = document.documentElement;
    const onScroll = () => root.classList.add('lx-still');
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Battery saver, from Chrome's battery status.
  useEffect(() => {
    if (!navigator.getBattery) return undefined;
    let battery = null; let was = false; let chargingSince = 0;
    const tip = () => {
      try {
        const last = Number(localStorage.getItem('luxe_bypass_tip') || 0);
        if (Date.now() - last < 7 * 864e5) return;
        localStorage.setItem('luxe_bypass_tip', String(Date.now()));
      } catch { return; }
      window.dispatchEvent(new CustomEvent('luxe-notify', { detail: { title: '🔌 Charging while you use Luxe', body: 'Charging and using the phone at once is what heats it most. If your Infinix has Bypass charging (look in Settings → Battery, or the game assistant), it powers the phone straight from the charger instead.', tag: 'bypass-tip', kind: 'other' } }));
    };
    const update = () => {
      if (!battery) return;
      const saver = (!battery.charging && battery.level <= 0.3) || battery.level <= 0.15;
      document.documentElement.classList.toggle('lx-saver', saver);
      if (saver && !was) window.dispatchEvent(new CustomEvent('luxe-notify', { detail: { title: '🔋 Battery saver on', body: `Battery at ${Math.round(battery.level * 100)}%: Luxe switched off its moving backgrounds to save power.`, tag: 'luxe-saver', kind: 'other' } }));
      was = saver;
      if (battery.charging) { if (!chargingSince) chargingSince = Date.now(); } else chargingSince = 0;
    };
    // 20 minutes in use on the charger: the bypass tip (once a week at most).
    const iv = setInterval(() => { if (chargingSince && !document.hidden && Date.now() - chargingSince > 20 * 60000) { tip(); chargingSince = Infinity; } }, 60000);
    navigator.getBattery().then((b) => {
      battery = b; update();
      b.addEventListener('levelchange', update); b.addEventListener('chargingchange', update);
    }).catch(() => {});
    return () => {
      clearInterval(iv);
      if (battery) { battery.removeEventListener('levelchange', update); battery.removeEventListener('chargingchange', update); }
    };
  }, []);

  return null;
}
