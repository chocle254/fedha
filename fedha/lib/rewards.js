// Reward wheel: celebrate saving by spending a little of it, guilt-free.
//
// Money for prizes lives in the Treat Jar, a special goal that gets
// TREAT_SHARE of every challenge save. Prizes are sized from what's in the
// jar, so a win can always be paid and real goals are never touched.
//
// Spins are earned at challenge milestones (normal wheel), and for finishing
// a challenge or reaching a goal (jackpot wheel). They're kept in settings so
// they sync across devices.
import { getSetting, setSetting } from './db';
import { genId } from './utils';

export const TREAT_SHARE = 0.1;
export const TREAT_JAR_PREFIX = 'treatjar_';
export const isTreatJar = (g) => String(g?.id || '').startsWith(TREAT_JAR_PREFIX);

// w = how likely (higher = more often). pct = share of the jar. treat = an
// experience to go with it. bonus = another spin instead of money.
export const WHEELS = {
  normal: [
    { label: '5%', pct: 0.05, w: 20, color: '#10B981' },
    { label: '😴 Lazy day', treat: 'Take a guilt-free lazy day. You earned it.', w: 14, color: '#8B5CF6' },
    { label: '10%', pct: 0.10, w: 18, color: '#3B82F6' },
    { label: '🍕 Treat meal', pct: 0.15, treat: 'Order your favourite meal.', w: 12, color: '#F59E0B' },
    { label: '15%', pct: 0.15, w: 13, color: '#EC4899' },
    { label: '🎁 Bonus spin', bonus: true, w: 8, color: '#14B8A6' },
    { label: '20%', pct: 0.20, w: 10, color: '#F97316' },
    { label: '30%', pct: 0.30, w: 5, color: '#EF4444' },
  ],
  jackpot: [
    { label: '25%', pct: 0.25, w: 20, color: '#10B981' },
    { label: '🎬 Night out', pct: 0.5, treat: 'Plan a night out on your savings.', w: 14, color: '#8B5CF6' },
    { label: '40%', pct: 0.40, w: 16, color: '#3B82F6' },
    { label: '🛍️ Shopping', pct: 0.4, treat: 'Buy that thing you keep looking at.', w: 12, color: '#EC4899' },
    { label: '50%', pct: 0.50, w: 12, color: '#F59E0B' },
    { label: '🎁 Bonus spin', bonus: true, w: 8, color: '#14B8A6' },
    { label: '75%', pct: 0.75, w: 6, color: '#F97316' },
    { label: '💯 Whole jar', pct: 1, w: 2, color: '#EF4444' },
  ],
};

export function pickSegment(wheel, rand = Math.random) {
  const total = wheel.reduce((s, x) => s + x.w, 0);
  let r = rand() * total;
  for (let i = 0; i < wheel.length; i++) { r -= wheel[i].w; if (r < 0) return i; }
  return wheel.length - 1;
}

// What a segment pays from a jar holding `jar` (rounded to tens).
export function prizeAmount(seg, jar) {
  if (!seg.pct || !(jar > 0)) return 0;
  if (seg.pct >= 1) return jar; // whole jar means every last shilling
  const raw = seg.pct * jar;
  const rounded = jar < 10 ? jar : Math.max(10, Math.round(raw / 10) * 10);
  return Math.min(jar, rounded);
}

// ─── Spins ───────────────────────────────────────────────────────────────────
const SPINS = 'reward_spins';
const HISTORY = 'reward_history';
const emit = (detail) => typeof window !== 'undefined' && window.dispatchEvent(new CustomEvent('fedha:rewards', { detail }));

export async function getSpins() { return (await getSetting(SPINS, [])) || []; }
export async function getRewardHistory() { return (await getSetting(HISTORY, [])) || []; }

export async function awardSpin(kind, reason) {
  const spins = await getSpins();
  const spin = { id: genId(), kind: kind === 'jackpot' ? 'jackpot' : 'normal', reason, at: new Date().toISOString() };
  await setSetting(SPINS, [...spins, spin]);
  emit({ type: 'earned', spin });
  return spin;
}

// Uses up a spin (jackpots first) and returns it.
export async function takeSpin() {
  const spins = await getSpins();
  if (!spins.length) return null;
  const i = spins.findIndex((s) => s.kind === 'jackpot');
  const idx = i >= 0 ? i : 0;
  const spin = spins[idx];
  await setSetting(SPINS, spins.filter((_, k) => k !== idx));
  emit({ type: 'used' });
  return spin;
}

export async function logReward(entry) {
  const h = await getRewardHistory();
  await setSetting(HISTORY, [{ at: new Date().toISOString(), ...entry }, ...h].slice(0, 30));
  emit({ type: 'history' });
}
