// Alerts once when the UpesiPay service wallet reaches zero, then stays quiet until it has
// been topped up above zero (which re-arms the alert).
import { getWalletAlert, setWalletAlert } from './nestlink-control';
import { pushToAll } from './nestlink-push';

export async function evaluateServiceWalletAlert(balance) {
  const value = Number(balance);
  if (!Number.isFinite(value)) return { zero: false, alerted: false };
  const state = await getWalletAlert();

  if (value > 0) {
    if (state.alerted) await setWalletAlert({ alerted: false, at: null });
    return { zero: false, alerted: false };
  }
  if (state.alerted) return { zero: true, alerted: false }; // already told you

  // Mark first so two overlapping checks cannot both send; undo if the push itself fails.
  await setWalletAlert({ alerted: true, at: new Date().toISOString() });
  try {
    const delivery = await pushToAll({
      title: 'UpesiPay service wallet is empty',
      body: 'The balance has reached KES 0. Top up to keep your services running.',
      tag: 'upesipay-zero',
      url: '/utilities/upesipay'
    });
    // Every device failed in transit: treat as not delivered so the next check retries.
    // (No subscribed device at all is not a failure; there is nobody to retry for.)
    if (delivery.sent === 0 && delivery.failed > 0) throw new Error('push delivery failed on all devices');
  } catch (e) {
    console.error('[fedha] UpesiPay zero-balance push failed:', e.message);
    await setWalletAlert({ alerted: false, at: null }).catch(() => {});
    return { zero: true, alerted: false };
  }
  console.log('[fedha] UpesiPay service wallet hit zero: alert sent');
  return { zero: true, alerted: true };
}
