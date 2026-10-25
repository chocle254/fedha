// Server-side switch + owner check for the NestLink automatic sweep.
// Fails closed: if the switch cannot be read, nothing is swept.
import { supabaseAdmin } from './supabaseAdmin';
import { requireUser } from './require-user';

const TABLE = 'nestlink_automation';

export async function getAutomation() {
  const { data, error } = await supabaseAdmin.from(TABLE).select('enabled,updated_at,last_sweep').eq('id', 1).maybeSingle();
  if (error) throw new Error(`Automation state unavailable: ${error.message}`);
  return { enabled: Boolean(data?.enabled), updatedAt: data?.updated_at || null, lastSweep: data?.last_sweep || null };
}

export async function setAutomation(enabled) {
  const { error } = await supabaseAdmin.from(TABLE).upsert({ id: 1, enabled: Boolean(enabled), updated_at: new Date().toISOString() });
  if (error) throw new Error(`Could not save automation state: ${error.message}`);
}

export async function recordSweep(summary) {
  const { error } = await supabaseAdmin.from(TABLE).update({ last_sweep: { ...summary, at: new Date().toISOString() } }).eq('id', 1);
  if (error) console.error('[fedha] Could not record sweep:', error.message);
}

export function isOwner(user) {
  const owners = String(process.env.NESTLINK_OWNER_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!owners.length) {
    console.warn('[fedha] NESTLINK_OWNER_EMAILS is not set; owner-only NestLink routes are locked.');
    return false;
  }
  return Boolean(user?.email) && owners.includes(String(user.email).toLowerCase());
}

// Returns the owner user, or sends 401/403 and returns null.
export async function requireOwner(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (!isOwner(user)) {
    res.status(403).json({ error: 'Owner access only.' });
    return null;
  }
  return user;
}
