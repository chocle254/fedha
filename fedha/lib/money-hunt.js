// Money hunt: the planner's daily block for finding paid work (Business → Earn Online, new clients).
// Gigs claimed in Earn Online are saved here so they survive a reload and the planner can name them.
import { getSetting, setSetting } from './db';

export const EARN_PENDING_KEY = 'earn_pending';
const CAP = 15; // claimed gigs kept; settings space is limited

export async function getEarnPending() {
  const v = await getSetting(EARN_PENDING_KEY, []);
  return Array.isArray(v) ? v : [];
}

// Keep only what the cards and the planner use, so a claimed gig stays small.
export function saveEarnPending(list) {
  const slim = (list || []).slice(0, CAP).map((o) => ({
    id: o.id, pending_id: o.pending_id, claimed_at: o.claimed_at, emoji: o.emoji, title: o.title,
    platform: o.platform, category: o.category, estimated_amount: o.estimated_amount,
    estimated_weekly_earnings: o.estimated_weekly_earnings, site_url: o.site_url || o.url || '',
    description: String(o.description || '').slice(0, 240),
  }));
  return setSetting(EARN_PENDING_KEY, slim);
}

// Money still owed on a client project (agreed + extras − already paid).
export function clientRemaining(p) {
  const paid = Number(p.previously_paid || 0) + (p.change_requests || []).reduce((s, x) => s + Number(x.previously_paid || 0), 0)
    + (p.payments || []).reduce((s, x) => s + Number(x.amount || 0), 0);
  const agreed = Number(p.agreed_amount || 0) + (p.change_requests || []).reduce((s, x) => s + Number(x.amount || 0), 0);
  return Math.max(0, agreed - paid);
}

// The day's money-hunt block. "hungry" (cash is low, or no paid work is lined up) makes it longer and moves it
// to the morning, when energy is best. Otherwise it is a short daily habit so the pipeline never runs dry.
export function moneyHuntItem({ clientProjects, onlineJobs, earnPending, lowCash }) {
  const paidWork = (clientProjects || []).some((p) => p.status === 'active') || (onlineJobs || []).length > 0;
  const hungry = !!lowCash || !paidWork;
  const claimed = (earnPending || []).slice(0, 2).map((o) => `${o.title}${o.platform ? ` (${o.platform})` : ''}`);
  const why = lowCash ? 'Cash is low, so this comes first. ' : !paidWork ? 'No paid work is lined up yet. ' : '';
  const steps = [
    claimed.length ? `Finish what you claimed: ${claimed.join(', ')}.` : null,
    'Message 3 people or businesses who could pay for a website or app, with a live link of your work.',
    'Follow up anyone who replied or went quiet.',
    claimed.length ? null : 'Check Business → Earn Online and claim one gig.',
  ].filter(Boolean);
  return {
    hungry,
    label: hungry ? 'Money Hunt — find paid work' : 'Money Hunt — keep the pipeline full',
    emoji: '💰',
    note: why + steps.map((s, i) => `${i + 1}) ${s}`).join(' ') + ' Log any money in Business when it lands.',
  };
}
