// Credits finished NestLink payouts to the Luxe wallet called "mpesa 2".
// Pure logic so it can be tested; components/NestLinkCredits.js wires it up.

export const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const findMpesa2 = (wallets) => (wallets || []).find((w) => normName(w.name) === 'mpesa2') || null;

// moneyLine(amount): optional extra text for the notification (today / week totals, streak: lib/earnings.js).
export async function applyCredits(payload, { wallets, addTransaction, getTransaction, notify, moneyLine = null }) {
  const acked = [];
  const applied = [];
  let missingWallet = false;

  for (const item of payload?.completed || []) {
    const txId = `nestlink_${item.reference}`;
    // Already credited (e.g. the acknowledgement was lost): just confirm it.
    if (await getTransaction(txId)) { acked.push(item.reference); continue; }
    const wallet = findMpesa2(wallets);
    if (!wallet) { missingWallet = true; continue; }
    await addTransaction({
      id: txId,
      type: 'income',
      amount: Number(item.payout),
      wallet_id: wallet.id,
      category: 'other',
      description: `NestLink payout ${item.reference}`,
      currency: wallet.currency || 'KES'
    });
    applied.push(item);
    acked.push(item.reference);
    await notify({
      title: 'Funds withdrawn',
      body: `💸 KES ${item.payout} sent to your M-Pesa and added to ${wallet.name}.${moneyLine ? ` ${moneyLine(Number(item.payout))}.` : ''}`,
      tag: `nestlink-${item.reference}`
    });
  }

  for (const item of payload?.failed || []) {
    await notify({
      title: 'Withdrawal failed',
      body: `KES ${item.payout} payout ${item.reference} was ${String(item.status).toLowerCase()}. The funds stay in NestLink.`,
      tag: `nestlink-${item.reference}`
    });
    acked.push(item.reference);
  }

  return { acked, applied, missingWallet };
}
