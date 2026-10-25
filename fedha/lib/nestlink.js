import crypto from 'crypto';
const BASE = (process.env.NESTLINK_BASE_URL || 'https://automate.nestlink.co.ke/api').replace(/\/$/, '');
export const isNestLinkConfigured = () => Boolean(process.env.NESTLINK_API_KEY && process.env.NESTLINK_CLIENT_SECRET && process.env.NESTLINK_ACCOUNT_NUMBER);
export const isSweepEnabled = () => process.env.NESTLINK_AUTO_SWEEP_ENABLED === 'true' && isNestLinkConfigured() && /^2547\d{8}$/.test(process.env.NESTLINK_RECIPIENT_PHONE || '') && Number.isInteger(Number(process.env.NESTLINK_WITHDRAWAL_FEE_KES)) && Number(process.env.NESTLINK_WITHDRAWAL_FEE_KES) >= 0;
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
export async function getNestLinkBalance() {
  const account = process.env.NESTLINK_ACCOUNT_NUMBER;
  if (!account) throw new Error('NESTLINK_ACCOUNT_NUMBER is not configured.');
  return nestLinkRequest('GET', `/v1/balance/${encodeURIComponent(account)}`);
}
export async function runNestLinkSweep(triggerId = crypto.randomUUID()) {
  if (!isSweepEnabled()) return { status:'disabled', message:'Automatic sweep is not fully configured.' };
  const account = process.env.NESTLINK_ACCOUNT_NUMBER, phone = process.env.NESTLINK_RECIPIENT_PHONE, fee = Number(process.env.NESTLINK_WITHDRAWAL_FEE_KES);
  const balance = await getNestLinkBalance(), availableMinor = Number(balance?.available_minor);
  if (!Number.isFinite(availableMinor) || availableMinor < 0) throw new Error('NestLink returned an invalid available_minor balance.');
  const availableKes = Math.floor(availableMinor / 100), payout = availableKes - fee;
  if (payout < 40) return { status:'below_minimum', available_minor:availableMinor, available_kes:availableKes, fee_kes:fee };
  const safe = String(triggerId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0,28) || crypto.randomUUID();
  const key = `fedha-sweep-${account}-${safe}`.slice(0,120);
  const result = await nestLinkRequest('POST','/v1/withdrawals',{ account_number:account, recipient_phone:phone, payout_amount:payout, currency:'KES', idempotency_key:key, merchant_reference:`fedha-${safe}`.slice(0,64) },key);
  return { status:'submitted', available_minor:availableMinor, available_kes:availableKes, fee_kes:fee, payout_amount:payout, withdrawal:result };
}
