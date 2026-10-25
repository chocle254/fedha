import crypto from 'crypto';

const BASE = (process.env.NESTLINK_BASE_URL || 'https://automate.nestlink.co.ke/api').replace(/\/$/, '');
const MIN_SWEEP_PAYOUT_KES = 30;

export const isNestLinkConfigured = () => Boolean(
  process.env.NESTLINK_API_KEY &&
  process.env.NESTLINK_CLIENT_SECRET &&
  process.env.NESTLINK_ACCOUNT_NUMBER
);

export const isSweepEnabled = () =>
  process.env.NESTLINK_AUTO_SWEEP_ENABLED === 'true' &&
  isNestLinkConfigured() &&
  /^254[17]\d{8}$/.test(process.env.NESTLINK_RECIPIENT_PHONE || '');

export function nestLinkWithdrawalFeeKes(amountKes) {
  if (!Number.isInteger(amountKes) || amountKes < 20) {
    throw new Error('NestLink withdrawal amount must be at least KES 20.');
  }
  if (amountKes <= 50) return 3;
  if (amountKes <= 100) return 6;
  if (amountKes <= 200) return 9;
  if (amountKes <= 500) return 23;
  if (amountKes <= 900) return 43;
  if (amountKes <= 1500) return 53;
  if (amountKes <= 3000) return 59;
  if (amountKes <= 6000) return 78;
  if (amountKes <= 10000) return 120;
  // Fees are paid in whole KES. Round the 0.9% fee up so the sweep
  // never assumes a fractional-shilling fee that NestLink may not accept.
  return Math.ceil(amountKes * 0.009);
}

/**
 * Find the largest whole-KES payout whose payout plus NestLink's fee fits
 * within the available balance. The fee tier is based on the payout amount.
 */
export function calculateNestLinkPayout(availableKes) {
  if (!Number.isSafeInteger(availableKes) || availableKes < 0) {
    throw new Error('Available balance must be a non-negative whole-KES amount.');
  }

  const tiers = [
    { min: 30, max: 50, fee: 3 },
    { min: 51, max: 100, fee: 6 },
    { min: 101, max: 200, fee: 9 },
    { min: 201, max: 500, fee: 23 },
    { min: 501, max: 900, fee: 43 },
    { min: 901, max: 1500, fee: 53 },
    { min: 1501, max: 3000, fee: 59 },
    { min: 3001, max: 6000, fee: 78 },
    { min: 6001, max: 10000, fee: 120 }
  ];

  let best = null;
  for (const tier of tiers) {
    const payout = Math.min(tier.max, availableKes - tier.fee);
    if (payout >= tier.min && payout + tier.fee <= availableKes &&
        (!best || payout > best.payout)) {
      best = { payout, fee: tier.fee, total: payout + tier.fee };
    }
  }

  if (availableKes > 10000) {
    let payout = Math.floor(availableKes / 1.009);
    while (payout > 10000 && payout + Math.ceil(payout * 0.009) > availableKes) payout--;
    if (payout > 10000) {
      const fee = Math.ceil(payout * 0.009);
      if (payout + fee <= availableKes && (!best || payout > best.payout)) {
        best = { payout, fee, total: payout + fee };
      }
    }
  }

  return best;
}

export async function nestLinkRequest(method, path, body, idempotencyKey) {
  const apiKey = process.env.NESTLINK_API_KEY, secret = process.env.NESTLINK_CLIENT_SECRET;
  if (!apiKey || !secret) throw new Error('NestLink credentials are not configured.');
  const timestamp = String(Math.floor(Date.now() / 1000)), nonce = crypto.randomUUID(), key = idempotencyKey || crypto.randomUUID();
  const bodyText = body === undefined ? '' : JSON.stringify(body);
  const hash = crypto.createHash('sha256').update(bodyText).digest('hex');
  const canonical = [method.toUpperCase(), `api${path}`, timestamp, nonce, key, hash].join('\n');
  const signature = crypto.createHmac('sha256', secret).update(canonical).digest('hex');
  const response = await fetch(`${BASE}${path}`, { method, headers: { Accept:'application/json', 'Content-Type':'application/json', 'X-API-Key':apiKey, 'X-Timestamp':timestamp, 'X-Nonce':nonce, 'X-Idempotency-Key':key, 'X-Signature':signature }, ...(bodyText ? { body:bodyText } : {}), cache:'no-store' });
  const raw = await response.text(); let data;
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message:raw.slice(0,250) }; }
  if (!response.ok) { const e = new Error(data?.message || data?.error || `NestLink request failed (${response.status}).`); e.status = response.status; throw e; }
  return data;
}

// NestLink may wrap the balance (e.g. { data: {...} }) or use camelCase names.
// Normalize to whole-number *_minor fields; anything missing becomes null.
export function normalizeNestLinkBalance(raw) {
  let src = raw && typeof raw === 'object' ? raw : {};
  for (const wrapper of ['data', 'balance', 'result']) {
    if (src[wrapper] && typeof src[wrapper] === 'object' && !Array.isArray(src[wrapper])) src = src[wrapper];
  }
  const pick = (...keys) => {
    for (const k of keys) {
      const v = src[k];
      if (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v))) return Number(v);
    }
    return null;
  };
  return {
    ...src,
    available_minor: pick('available_minor', 'availableMinor', 'available_balance_minor', 'availableBalanceMinor'),
    balance_minor: pick('balance_minor', 'balanceMinor', 'total_minor', 'totalMinor', 'ledger_minor', 'ledgerMinor'),
    holds_minor: pick('holds_minor', 'holdsMinor', 'hold_minor', 'holdMinor', 'held_minor', 'heldMinor')
  };
}

export async function getNestLinkBalance() {
  const account = process.env.NESTLINK_ACCOUNT_NUMBER;
  if (!account) throw new Error('NESTLINK_ACCOUNT_NUMBER is not configured.');
  const raw = await nestLinkRequest('GET', `/v1/balance/${encodeURIComponent(account)}`);
  const balance = normalizeNestLinkBalance(raw);
  if (balance.available_minor === null) {
    const keys = Object.keys(raw && typeof raw === 'object' ? raw : {}).slice(0, 12).join(', ') || 'none';
    const e = new Error(`NestLink balance response has no recognizable available amount. Keys received: ${keys}`);
    e.status = 502;
    throw e;
  }
  return balance;
}

export async function runNestLinkSweep(triggerId = crypto.randomUUID()) {
  if (!isSweepEnabled()) return { status:'disabled', message:'Automatic sweep is not fully configured.' };
  const account = process.env.NESTLINK_ACCOUNT_NUMBER, phone = process.env.NESTLINK_RECIPIENT_PHONE;
  const balance = await getNestLinkBalance(), availableMinor = Number(balance?.available_minor);
  if (!Number.isSafeInteger(availableMinor) || availableMinor < 0) {
    throw new Error('NestLink returned an invalid available_minor balance.');
  }

  // Keep whole-KES payouts; any sub-KES remainder stays in the account.
  const availableKes = Math.floor(availableMinor / 100);
  const payoutPlan = calculateNestLinkPayout(availableKes);
  if (!payoutPlan || payoutPlan.payout < MIN_SWEEP_PAYOUT_KES) {
    return { status:'below_minimum', available_minor:availableMinor, available_kes:availableKes, minimum_payout_kes:MIN_SWEEP_PAYOUT_KES };
  }

  const safe = String(triggerId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0,28) || crypto.randomUUID();
  const key = `fedha-sweep-${account}-${safe}`.slice(0,120);
  const result = await nestLinkRequest('POST','/v1/withdrawals',{ account_number:account, recipient_phone:phone, payout_amount:payoutPlan.payout, currency:'KES', idempotency_key:key, merchant_reference:`fedha-${safe}`.slice(0,64) },key);
  return {
    status:'submitted',
    available_minor:availableMinor,
    available_kes:availableKes,
    fee_kes:payoutPlan.fee,
    payout_amount:payoutPlan.payout,
    expected_total_deduction_kes:payoutPlan.total,
    expected_remaining_kes:availableKes - payoutPlan.total,
    withdrawal:result
  };
}
