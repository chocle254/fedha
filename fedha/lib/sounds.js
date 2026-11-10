// lib/sounds.js — Luxe's own sounds (public/sounds/x-*.wav, made by scripts/make-sounds.py): bell and plucked
// tones in one key, so every notification sounds like the same instrument.
//   x-luxe  the signature (general news)    x-money  money in          x-trade  a trade opened
//   x-win   target hit                      x-loss   stopped out       x-alert  something needs you now
//   x-planner  time for the next thing      x-study  class and focus   x-tier   a new wealth tier
// Muted with the 🔕 on any banner (localStorage luxe_banner_mute). Each file loads the first time it is needed.
export const MUTE_KEY = 'luxe_banner_mute';
const cache = {};
export function playSound(name, volume = 0.8) {
  try {
    if (typeof window === 'undefined' || localStorage.getItem(MUTE_KEY) === '1') return;
    const a = cache[name] || (cache[name] = new Audio(`/sounds/${name}.wav`));
    a.currentTime = 0; a.volume = volume; a.play().catch(() => {});
  } catch { /* no audio */ }
}
