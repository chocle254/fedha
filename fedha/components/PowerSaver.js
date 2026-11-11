import { useEffect } from 'react';

// Keeps Luxe cool on the phone. Invisible; switches a class on <html> (styles/globals.css). Background motion
// otherwise runs all the time (Luxe is on the phone's game-mode list, so it has the power for it).
//   lx-saver  battery low and not charging (30 % or less, or 15 % or less even when charging): no background
//             motion at all and slower live counters. Says so once when it turns on. Also on in light mode (below).
// Also, once a week at most: a tip about using bypass charging when Luxe is busy on the charger.
// Light mode: the same switch, for a machine that is too small for the moving 3D backgrounds (an old laptop).
// On by itself when the browser reports 2 GB of memory or less; open Luxe once with ?lite=1 to force it on, or
// ?lite=0 to force it off (remembered on that device).
function lite() {
  try {
    const q = new URLSearchParams(window.location.search).get('lite');
    if (q === '1' || q === '0') localStorage.setItem('luxe_lite', q);
    const set = localStorage.getItem('luxe_lite');
    if (set === '1') return true;
    if (set === '0') return false;
  } catch { /* private mode: go by the memory */ }
  return Number(navigator.deviceMemory) > 0 && Number(navigator.deviceMemory) <= 2;
}

export default function PowerSaver() {
  // Battery saver, from Chrome's battery status.
  useEffect(() => {
    const small = lite();
    if (small) document.documentElement.classList.add('lx-saver');
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
      document.documentElement.classList.toggle('lx-saver', saver || small);
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
