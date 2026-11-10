import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useApp } from '../context/AppContext';
import { tierFor, applyTier, clearTier } from '../lib/wealth-tiers';
import { getSetting, setSetting } from '../lib/db';
import { fireConfetti } from '../lib/confetti';
import { themeKeyFor, applyTheme } from '../lib/themes';
import { formatCurrency, formatShort } from '../lib/utils';
import TierMotion, { MOODS } from './TierMotion';
import HolidayScene from './HolidayScene';
import { holidayFor } from '../lib/holidays';

// The wealth tier follows you onto every money screen (Home, Wallets, Transactions, Budgets, Goals, Reports,
// Utilities…): background, accents, card glow and chart colours. Screens with their own mood (Trading, Music,
// Learning…) keep it. The first time a tier is reached, wherever you are, it is celebrated once.
export default function TierSync() {
  const { netWorth, loading } = useApp();
  const router = useRouter();
  const tier = tierFor(netWorth);
  const money = themeKeyFor(router.pathname) === 'money';
  const [pop, setPop] = useState(null);

  useEffect(() => {
    // After the section theme (components/Ambience.js) has painted its colours.
    const t = setTimeout(() => (money ? applyTier(tier) : clearTier()), 40);
    return () => clearTimeout(t);
  }, [tier.index, money]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (loading || tier.index === 0) return;
    getSetting('wealth_tier_best', 0).then((best) => {
      if (tier.index > (Number(best) || 0)) { setSetting('wealth_tier_best', tier.index); setPop(tier); fireConfetti(); }
    }).catch(() => {});
  }, [loading, tier.index]); // eslint-disable-line react-hooks/exhaustive-deps

  // Today's holiday takes over the motion; otherwise the tier's own mood. Only the current one is built.
  const [holiday, setHoliday] = useState(null);
  useEffect(() => { const check = () => setHoliday(holidayFor(new Date())); check(); const t = setInterval(check, 30 * 60e3); window.addEventListener('luxe-holiday-refresh', check); return () => { clearInterval(t); window.removeEventListener('luxe-holiday-refresh', check); }; }, []);
  // The first time Luxe opens on a holiday, a holiday banner (with its sound) says hello.
  useEffect(() => {
    if (!holiday) return undefined;
    const key = `luxe_hol_hello_${new Date().toDateString()}`;
    try { if (localStorage.getItem(key)) return undefined; } catch { return undefined; }
    const t = setTimeout(() => {
      try { localStorage.setItem(key, '1'); } catch { /* private */ }
      window.dispatchEvent(new CustomEvent('luxe-notify', { detail: { title: holiday.greeting, body: { halloween: 'The app is dark tonight. Watch the graves.', christmas: 'Snow is falling on Luxe. Look up for Santa.', birthday: 'Your Birthday Hub is waiting on Home.', newyear: 'A new year, a new tier to climb.', vice: 'Neon nights until release. Stack your money while you wait.' }[holiday.key] || `Luxe is dressed up for ${holiday.name}.`, tag: `holiday_${holiday.key}`, kind: 'other' } }));
    }, 2500);
    return () => clearTimeout(t);
  }, [holiday?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  // A peek: Home's "Peek at the next world" button shows the world one tier up for 20 seconds, then yours returns.
  // (Opening any page with ?peek=gold, ?peek=imperial… does the same for a minute, for checking a world.)
  const [peek, setPeek] = useState(null);
  useEffect(() => {
    let timer = 0;
    const show = (key, seconds) => { if (!MOODS[key]) return; clearTimeout(timer); setPeek(key); timer = setTimeout(() => setPeek(null), Math.max(5, Math.min(120, Number(seconds) || 20)) * 1000); };
    const onPeek = (e) => show(e.detail?.key, e.detail?.seconds);
    window.addEventListener('luxe-tier-peek', onPeek);
    try { const q = new URLSearchParams(window.location.search).get('peek'); if (q) show(q, 60); } catch { /* no URL */ }
    return () => { clearTimeout(timer); window.removeEventListener('luxe-tier-peek', onPeek); };
  }, []);
  const mood = peek ? MOODS[peek] : holiday ? { glows: holiday.glows, emit: holiday.emit } : MOODS[tier.key];
  const moodKey = peek ? `peek-${peek}` : holiday ? `h-${holiday.key}` : tier.key;
  // The holiday's motion runs on every screen (the whole app dresses up); a tier's only on money screens,
  // except the 3D worlds (Sapphire's aquarium and every tier above it), which are the background everywhere.
  const motion = mood && (money || holiday || mood.aquarium || mood.world) ? <>{holiday?.scene && !peek && <HolidayScene kind={holiday.scene} />}<TierMotion moodKey={moodKey} mood={mood} /></> : null;

  // Holiday skin, app-wide: html[data-holiday] styles cards, numbers, buttons and the nav (styles/globals.css),
  // the holiday accent wins over the section's, and only today's display font is downloaded.
  useEffect(() => {
    const root = document.documentElement;
    if (!holiday) {
      if (!root.dataset.holiday) return undefined;
      // A holiday just ended (or Vice mode was switched off): put the tier's or section's colours back.
      delete root.dataset.holiday; root.style.removeProperty('--holiday-font');
      const t = setTimeout(() => { applyTheme(themeKeyFor(router.pathname)); if (money) applyTier(tier); }, 50);
      return () => clearTimeout(t);
    }
    root.dataset.holiday = holiday.key;
    const sk = holiday.skin || {};
    if (sk.font && !document.getElementById('lx-holiday-font')) {
      const l = document.createElement('link');
      l.id = 'lx-holiday-font'; l.rel = 'stylesheet';
      l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(sk.font).replace(/%20/g, '+')}&display=swap`;
      document.head.appendChild(l);
    }
    const t = setTimeout(() => {
      if (sk.accent) { root.style.setProperty('--accent', sk.accent); root.style.setProperty('--accent-dim', `${sk.accent}24`); root.style.setProperty('--accent-glow', `${sk.accent}59`); root.style.setProperty('--accent-soft', `${sk.accent}38`); }
      if (sk.accent2) root.style.setProperty('--accent-2', sk.accent2);
      if (sk.font) root.style.setProperty('--holiday-font', `'${sk.font}', cursive`);
    }, 80); // after the section theme and the tier
    return () => clearTimeout(t);
  }, [holiday?.key, router.pathname, tier.index]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!pop) return motion;
  return (
    <>
    {motion}
    <div className="lx-tier-pop" onClick={() => setPop(null)} role="dialog" aria-label={`${pop.name} tier unlocked`}>
      <div>
        <div style={{ fontSize: 56 }}>{pop.icon}</div>
        <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 800, color: 'var(--accent)', marginTop: 6 }}>NEW TIER UNLOCKED</div>
        <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }}>{pop.name}</div>
        <div style={{ fontSize: 13.5, color: 'var(--text-2)', marginTop: 8, lineHeight: 1.5 }}>
          Net worth past {formatCurrency(pop.min, 'KES')}. Every money screen just got the {pop.name} look{pop.index >= 4 ? ', with the shine' : ''}.
          {pop.next ? ` Next: ${pop.next.icon} ${pop.next.name} at ${formatShort(pop.next.min, 'KES')}.` : ' The top tier. Legend.'}
        </div>
        <button className="btn-primary" style={{ marginTop: 16, width: '100%' }} onClick={() => setPop(null)}>Let&apos;s go</button>
      </div>
    </div>
    </>
  );
}
