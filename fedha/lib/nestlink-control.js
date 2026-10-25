// Server-side switch + owner check for the NestLink automatic sweep.
// Fails closed: if the switch cannot be read, nothing is swept.
import { requireUser } from './require-user';

const TABLE = 'nestlink_automation';

// Loaded on demand: the admin client throws at import time when SUPABASE_SERVICE_ROLE_KEY
// is missing, which must only affect the automation switch, never the balance route.
async function admin() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return (await import('./supabaseAdmin')).supabaseAdmin;
}

export async function getAutomation() {
  const { data, error } = await (await admin()).from(TABLE).select('enabled,updated_at,last_sweep').eq('id', 1).maybeSingle();
  if (error) throw new Error(`Automation state unavailable: ${error.message}`);
  return { enabled: Boolean(data?.enabled), updatedAt: data?.updated_at || null, lastSweep: data?.last_sweep || null };
}

export async function setAutomation(enabled) {
  const { error } = await (await admin()).from(TABLE).upsert({ id: 1, enabled: Boolean(enabled), updated_at: new Date().toISOString() });
  if (error) throw new Error(`Could not save automation state: ${error.message}`);
}

export async function recordSweep(summary) {
  const { error } = await (await admin()).from(TABLE).update({ last_sweep: { ...summary, at: new Date().toISOString() } }).eq('id', 1);
  if (error) console.error('[fedha] Could not record sweep:', error.message);
}

// Fedha is a single-user personal app, so any signed-in user is allowed.
// (Keep Supabase sign-ups disabled so no one else can create an account.)
export async function requireOwner(req, res) {
  return requireUser(req, res);
}

// ─── Pending payouts (waiting to be confirmed by NestLink and credited in Fedha) ───
export async function getPending() {
  const { data, error } = await (await admin()).from(TABLE).select('pending').eq('id', 1).maybeSingle();
  if (error) throw new Error(`Pending payouts unavailable: ${error.message}`);
  return Array.isArray(data?.pending) ? data.pending : [];
}

export async function savePending(list) {
  const { error } = await (await admin()).from(TABLE).update({ pending: list }).eq('id', 1);
  if (error) throw new Error(`Could not save pending payouts: ${error.message}`);
}

export async function addPending(entry) {
  const list = await getPending();
  if (list.some(x => x.reference === entry.reference)) return;
  await savePending([...list, { status: 'SUBMITTED', at: new Date().toISOString(), ...entry }].slice(-50));
}
