import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useApp } from '../context/AppContext';
import { tierFor, applyTier, clearTier } from '../lib/wealth-tiers';
import { getSetting, setSetting } from '../lib/db';
import { fireConfetti } from '../lib/confetti';
import { themeKeyFor } from '../lib/themes';
import { formatCurrency, formatShort } from '../lib/utils';
import TierMotion, { MOODS } from './TierMotion';
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
  useEffect(() => { const check = () => setHoliday(holidayFor(new Date())); check(); const t = setInterval(check, 30 * 60e3); return () => clearInterval(t); }, []);
  const mood = holiday ? { glows: holiday.glows, emit: holiday.emit } : MOODS[tier.key];
  const moodKey = holiday ? `h-${holiday.key}` : tier.key;
  const motion = money && mood ? <TierMotion moodKey={moodKey} mood={mood} /> : null;
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
