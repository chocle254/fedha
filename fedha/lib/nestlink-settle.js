// Confirms pending NestLink payouts and sends a push notification once each one finishes.
import { getPending, savePending } from './nestlink-control';
import { getNestLinkWithdrawalStatus } from './nestlink';
import { pushToAll } from './nestlink-push';
import { earningsNow, celebrate } from './earnings-server';
import { incomeLine } from './earnings';

const DEAD = ['FAILED', 'REVERSED'];
export const isFinal = (s) => s === 'COMPLETED' || DEAD.includes(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// reference + waitMs: used by the NestLink webhook, which arrives the instant a payout is
// created. It waits (bounded; NestLink expects a reply within 10s) for the payout to be
// recorded and to finish.
export async function settlePending({ waitMs = 0, reference = null } = {}) {
  const deadline = Date.now() + waitMs;
  let list;
  for (;;) {
    list = await getPending();
    let changed = false;
    for (const item of list) {
      if (isFinal(item.status)) continue;
      try {
        const status = await getNestLinkWithdrawalStatus(item.reference);
        if (status !== item.status) { item.status = status; changed = true; }
      } catch (e) {
        console.error('[fedha] NestLink status check failed:', item.reference, e.message);
      }
    }
    if (changed) await savePending(list);
    const target = reference ? list.find((x) => x.reference === reference) : null;
    const needWait = Boolean(reference) && (!target || !isFinal(target.status));
    if (!needWait || Date.now() + 2000 > deadline) break;
    await sleep(2000);
  }

  let pushedAny = false;
  for (const item of list) {
    if (!isFinal(item.status) || item.pushed) continue;
    const completed = item.status === 'COMPLETED';
    // Money in: add today's / this week's totals and the streak, and celebrate records and milestones.
    let earned = null;
    if (completed) {
      try {
        const before = await earningsNow();
        earned = await earningsNow({ extra: Number(item.payout), skipId: `nestlink_${item.reference}` });
        await celebrate(earned.summary, earned.userId, before.summary.week);
      } catch (e) { console.warn('[fedha] earnings summary failed:', e.message); }
    }
    try {
      const delivery = await pushToAll({
        title: completed ? 'Funds withdrawn' : 'Withdrawal failed',
        body: completed
          ? `💸 KES ${item.payout} sent to your M-Pesa.${earned ? ` ${incomeLine(earned.summary)}.` : ''}`
          : `KES ${item.payout} payout ${item.reference} was ${item.status.toLowerCase()}. The funds stay in NestLink.`,
        tag: `nestlink-${item.reference}`
      });
      if (delivery.sent === 0 && delivery.failed > 0) continue; // all devices failed: retry on the next check
    } catch (e) {
      console.error('[fedha] NestLink push error:', e.message);
    }
    item.pushed = true; // never push the same payout twice, even if no device was subscribed
    pushedAny = true;
  }
  if (pushedAny) await savePending(list);
  return list;
}
