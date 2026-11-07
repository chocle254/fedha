// Money helpers for Business: gigs claimed in Earn Online, and what clients still owe.
// Gigs claimed in Earn Online are saved here so they survive a reload.
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

