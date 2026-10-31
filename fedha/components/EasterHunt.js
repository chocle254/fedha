import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';
import { useApp } from '../context/AppContext';
import { getSetting, setSetting } from '../lib/db';
import { holidayFor } from '../lib/holidays';
import { fireConfetti } from '../lib/confetti';
import { loadAll, record } from '../lib/study';

// The Easter egg hunt (Good Friday to Easter Monday): 10 eggs hidden across Luxe, one per screen, somewhere you
// have to scroll to. Tap one: it cracks and gives a prize (study XP or a fun fact). Find all 10 and the golden
// egg puts an "Easter Egg Hunter" certificate in your Certificates Room. A small counter gives hints.
// Saved per year in settings 'easter_hunt_<year>' = { found: [egg ids], done }.
const SPOTS = [
  ['/', 'Home'], ['/wallets', 'Wallets'], ['/transactions', 'Transactions'], ['/goals', 'Goals'], ['/budgets', 'Budgets'],
  ['/learning', 'Learning'], ['/planner', 'Planner'], ['/music', 'Music'], ['/tech-hub', 'Tech Hub'], ['/trading', 'Trading'],
];
const PRIZES = [
  { xp: 20, text: 'Compound interest is money earning money on money it already earned. Ziidi does it every midnight.' },
  { xp: 15, text: 'The first computer "bug" was a real moth, taped into a logbook in 1947.' },
  { xp: 25, text: 'Saving 30% of every deposit, like Luxe asks, doubles your savings speed versus 15%.' },
  { xp: 15, text: 'The Easter egg idea in software started in 1979: a game designer hid his name in Atari Adventure.' },
  { xp: 20, text: 'Most data breaches start with a reused or weak password. Unique passwords are cheap armour.' },
  { xp: 15, text: 'Neural networks were inspired by brain cells in the 1940s, decades before computers could run them well.' },
  { xp: 25, text: 'Paying yourself first is the oldest wealth rule: save before you spend, not after.' },
  { xp: 15, text: 'M-Pesa launched in Kenya in 2007 and changed how a whole continent moves money.' },
  { xp: 20, text: 'The best time to learn a skill is the year before you need it.' },
  { xp: 50, golden: true, text: 'The golden egg. You found every single one.' },
];
const rnd = (i, k) => { const x = Math.sin(i * 91.7 + k * 47.3) * 10000; return x - Math.floor(x); };

export default function EasterHunt() {
  const router = useRouter();
  const { addCertificate } = useApp();
  const [on, setOn] = useState(false);
  const [year, setYear] = useState(0);
  const [found, setFound] = useState([]);
  const [prize, setPrize] = useState(null);
  const [cracking, setCracking] = useState(false);
  const [hint, setHint] = useState(false);
  const [pageH, setPageH] = useState(0);
  const [host, setHost] = useState(null);

  useEffect(() => {
    const h = holidayFor(new Date());
    if (h?.key !== 'easter') return;
    const y = new Date().getFullYear();
    setOn(true); setYear(y); setHost(document.body);
    getSetting(`easter_hunt_${y}`, null).then((r) => setFound(r?.found || []));
  }, []);
  useEffect(() => {
    if (!on) return undefined;
    const measure = () => setPageH(document.documentElement.scrollHeight);
    const t = setTimeout(measure, 1200);
    window.addEventListener('resize', measure);
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); };
  }, [on, router.pathname]);

  const idx = SPOTS.findIndex(([p]) => p === router.pathname);
  const egg = useMemo(() => {
    if (idx < 0 || !pageH) return null;
    const id = `${year}-${idx}`;
    if (found.includes(id)) return null;
    const vh = window.innerHeight;
    const top = Math.max(vh * 0.6, Math.min(pageH - 140, vh * 0.6 + rnd(year + idx, 1) * Math.max(0, pageH - vh * 0.6 - 160)));
    return { id, top, left: 6 + rnd(year + idx, 2) * 78, hue: Math.round(rnd(year + idx, 3) * 360) };
  }, [idx, pageH, found, year]);

  const crack = async () => {
    if (!egg || cracking) return;
    setCracking(true);
    const next = [...found, egg.id];
    const last = next.length >= SPOTS.length;
    const p = last ? PRIZES[PRIZES.length - 1] : PRIZES[(next.length - 1) % (PRIZES.length - 1)];
    setTimeout(async () => {
      setFound(next); setCracking(false); setPrize({ ...p, n: next.length });
      await setSetting(`easter_hunt_${year}`, { found: next, done: last });
      try { const st = await loadAll(); await record(st, { kind: 'gift', topic: 'Easter egg', xp: p.xp }); } catch { /* XP is a bonus */ }
      if (last) {
        fireConfetti();
        addCertificate?.({ title: `Easter Egg Hunter ${year}`, achievement: 'Award', category: 'Award', organization: 'Luxe', recipient_name: 'Me', description: `Found all ${SPOTS.length} eggs hidden across Luxe at Easter ${year}.`, date_earned: new Date().toISOString(), image: '' }).catch?.(() => {});
      }
    }, 650);
  };

  if (!on || !host) return null;
  const left = SPOTS.filter((_, i) => !found.includes(`${year}-${i}`));
  return createPortal(
    <>
      {egg && (
        <button className={`eh-egg ${cracking ? 'eh-crack' : ''}`} onClick={crack} aria-label="An Easter egg!" style={{ top: egg.top, left: `${egg.left}%`, '--h': egg.hue }}>
          <span className="eh-shell" />
        </button>
      )}
      <button className="eh-count" onClick={() => setHint(!hint)} aria-label="Easter egg hunt">
        🥚 {found.length}/{SPOTS.length}
        {hint && <span className="eh-hint">{left.length ? `Still hiding on: ${left.map(([, n]) => n).join(', ')}. Scroll down, they like low places.` : 'All found. Legend.'}</span>}
      </button>
      {prize && (
        <div className="lx-tier-pop" onClick={() => setPrize(null)} role="dialog" aria-label="Egg prize">
          <div>
            <div style={{ fontSize: 54 }}>{prize.golden ? '🌟' : '🐣'}</div>
            <div style={{ fontSize: 12, letterSpacing: 2, fontWeight: 800, color: 'var(--accent)', marginTop: 6 }}>{prize.golden ? 'THE GOLDEN EGG' : `EGG ${prize.n} OF ${SPOTS.length}`}</div>
            <div style={{ fontSize: 14, color: 'var(--text)', marginTop: 10, lineHeight: 1.55 }}>{prize.text}</div>
            <div style={{ fontSize: 12.5, color: 'var(--green)', marginTop: 8, fontWeight: 700 }}>+{prize.xp} study XP{prize.golden ? ' · Easter Egg Hunter certificate added to your Certificates Room' : ''}</div>
            <button className="btn-primary" style={{ marginTop: 14, width: '100%' }} onClick={() => setPrize(null)}>{prize.golden ? 'Amazing' : 'Keep hunting'}</button>
          </div>
        </div>
      )}
    </>,
    host,
  );
}
