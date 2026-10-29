// Server side of SMS capture. The Android app (SmsReceiver / PairActivity) forwards M-Pesa and Ziidi texts with a
// device token; this file checks the token, reads each message (lib/sms-parser.js), decides which wallet it
// belongs to, and stores it in sms_inbox.
//
// Which wallet:
//   M-Pesa texts arrive on the SIM whose account they are for, so the SIM slot decides (settings 'sms_device'.sims).
//   Ziidi texts all arrive on one SIM whatever the account, so they are matched to the M-Pesa text for the same
//   amount within 10 minutes (that one carries the right SIM). Unmatched ones stay unassigned for you to pick.
//
// Privacy: message text is wiped once recorded and after BODY_DAYS at the latest (wipeOld); the code stays for
// duplicates.
import crypto from 'crypto';
import { supabaseAdmin } from './supabaseAdmin';
import { parseSms, isMoneySender, categoryFor, partyKey } from './sms-parser';

const KEY = 'sms_device';
const RULES = 'sms_categories';
const BODY_DAYS = 7;
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

async function getDevice(userId) {
  const { data } = await supabaseAdmin.from('settings').select('value').eq('user_id', userId).eq('key', KEY).maybeSingle();
  return data?.value || null;
}
async function putDevice(userId, value) {
  await supabaseAdmin.from('settings').upsert({ user_id: userId, key: KEY, value, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
}

export async function getRules(userId) {
  const { data } = await supabaseAdmin.from('settings').select('value').eq('user_id', userId).eq('key', RULES).maybeSingle();
  return data?.value || {};
}

// You picked a category for this message: remember it for the name, and apply it to every captured message from
// the same name (same direction) that has none yet.
export async function setCategory(userId, id, category) {
  const { data: row } = await supabaseAdmin.from('sms_inbox').select('parsed').eq('user_id', userId).eq('id', id).maybeSingle();
  const key = partyKey(row?.parsed);
  if (!row?.parsed) return;
  if (key) {
    const rules = { ...(await getRules(userId)), [key]: category || undefined };
    if (!category) delete rules[key];
    await supabaseAdmin.from('settings').upsert({ user_id: userId, key: RULES, value: rules, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
    const { data: same } = await supabaseAdmin.from('sms_inbox').select('id, parsed').eq('user_id', userId).neq('status', 'recorded');
    for (const r of same || []) {
      if (partyKey(r.parsed) === key && (r.id === id || !r.parsed.category || r.parsed.category_auto)) {
        await supabaseAdmin.from('sms_inbox').update({ parsed: { ...r.parsed, category: category || null, category_auto: r.id !== id } }).eq('id', r.id);
      }
    }
  } else {
    await supabaseAdmin.from('sms_inbox').update({ parsed: { ...row.parsed, category: category || null } }).eq('user_id', userId).eq('id', id);
  }
}

// Default SIM map: the first two M-Pesa (mobile, non-pocket) wallets, oldest first, as SIM 1 and SIM 2.
async function defaultSims(userId) {
  const { data } = await supabaseAdmin.from('wallets').select('id, name, type, pocket, created_at').eq('user_id', userId).eq('type', 'mobile').is('pocket', null).order('created_at', { ascending: true });
  const w = data || [];
  return { 1: w[0]?.id || null, 2: w[1]?.id || w[0]?.id || null };
}

// New pairing: a fresh token (only its hash is stored), keeping the SIM map from before.
export async function pairDevice(userId) {
  const token = crypto.randomBytes(24).toString('base64url');
  const old = await getDevice(userId);
  await putDevice(userId, { hash: sha(token), paired_at: new Date().toISOString(), sims: old?.sims || await defaultSims(userId), last_seen: null });
  return token;
}

export async function setSims(userId, sims) {
  const d = (await getDevice(userId)) || {};
  await putDevice(userId, { ...d, sims: { 1: sims?.[1] || null, 2: sims?.[2] || null } });
  return getDevice(userId);
}

export async function deviceInfo(userId) {
  const d = await getDevice(userId);
  return d ? { paired_at: d.paired_at, last_seen: d.last_seen, sims: d.sims } : null;
}

async function userForToken(token) {
  if (!token) return null;
  const { data } = await supabaseAdmin.from('settings').select('user_id, value').eq('key', KEY).filter('value->>hash', 'eq', sha(token)).maybeSingle();
  return data ? { userId: data.user_id, device: data.value } : null;
}

// Ziidi texts: find the M-Pesa text from the same moment and amount, and use its wallet.
async function walletForZiidi(userId, at, p) {
  const amts = (p.amounts || []).filter((a) => a > 0);
  if (!amts.length) return null;
  const t = new Date(at).getTime();
  const { data } = await supabaseAdmin.from('sms_inbox').select('wallet_id, parsed, received_at')
    .eq('user_id', userId).not('wallet_id', 'is', null)
    .gte('received_at', new Date(t - 10 * 60e3).toISOString()).lte('received_at', new Date(t + 10 * 60e3).toISOString());
  const hit = (data || []).find((r) => r.parsed?.kind !== 'ziidi' && amts.includes(Number(r.parsed?.amount)));
  return hit ? `${hit.wallet_id}_ziidi` : null;
}

// messages: [{ sender, body, slot, at }] from the phone. Returns counts.
export async function ingest(token, messages) {
  const who = await userForToken(token);
  if (!who) return { error: 'This phone is not linked. Link it again from Luxe → Wallets.' };
  const { userId, device } = who;
  const sims = device.sims || {};
  const rules = await getRules(userId);
  const { data: open } = await supabaseAdmin.from('loans').select('id').eq('user_id', userId).neq('status', 'settled');
  const activeLoans = (open || []).map((l) => l.id);
  let stored = 0, skipped = 0;
  for (const m of (Array.isArray(messages) ? messages : []).slice(0, 300)) {
    const sender = String(m.sender || '').slice(0, 40);
    const body = String(m.body || '').slice(0, 1200);
    if (!body || !isMoneySender(sender, body)) { skipped++; continue; }
    const at = new Date(Number(m.at) || Date.now()).toISOString();
    const slot = [1, 2].includes(Number(m.slot)) ? Number(m.slot) : null;
    const parsed = parseSms(body, sender);
    if (parsed) { const c = categoryFor(parsed, rules, activeLoans); if (c) Object.assign(parsed, { category: c, category_auto: true }); }
    let wallet = null;
    if (parsed?.kind === 'ziidi') wallet = await walletForZiidi(userId, at, parsed);
    else if (slot) wallet = sims[slot] || null;
    const row = {
      user_id: userId, sender, body, sim_slot: slot, received_at: at, code: parsed?.code || null,
      fingerprint: sha(`${sender}|${at}|${body}`), parsed, wallet_id: wallet, status: parsed ? 'captured' : 'unparsed',
    };
    // A message with a code already seen (the same text resent, or caught twice) is a duplicate.
    if (row.code) {
      const { data: dup } = await supabaseAdmin.from('sms_inbox').select('id').eq('user_id', userId).eq('code', row.code).limit(1);
      if (dup?.length) { skipped++; continue; }
    }
    const { error } = await supabaseAdmin.from('sms_inbox').upsert(row, { onConflict: 'user_id,fingerprint', ignoreDuplicates: true });
    if (error) {
      if (/relation .* does not exist|sms_inbox/i.test(error.message)) return { error: 'Run supabase-migration-sms-inbox.sql first.' };
      skipped++;
    } else stored++;
  }
  await putDevice(userId, { ...device, last_seen: new Date().toISOString() });
  await wipeOld(userId);
  return { ok: true, stored, skipped };
}

// Privacy: drop the text of anything recorded, and of everything older than BODY_DAYS.
export async function wipeOld(userId) {
  await supabaseAdmin.from('sms_inbox').update({ body: null }).eq('user_id', userId).eq('status', 'recorded').not('body', 'is', null);
  await supabaseAdmin.from('sms_inbox').update({ body: null }).eq('user_id', userId).lt('received_at', new Date(Date.now() - BODY_DAYS * 864e5).toISOString()).not('body', 'is', null);
}

export async function recentSms(userId, limit = 80) {
  await wipeOld(userId);
  const { data, error } = await supabaseAdmin.from('sms_inbox').select('id, sender, body, sim_slot, received_at, code, parsed, wallet_id, status')
    .eq('user_id', userId).order('received_at', { ascending: false }).limit(limit);
  return { items: data || [], needsMigration: !!error };
}

export async function setSmsWallet(userId, id, walletId) {
  await supabaseAdmin.from('sms_inbox').update({ wallet_id: walletId || null }).eq('user_id', userId).eq('id', id);
}
