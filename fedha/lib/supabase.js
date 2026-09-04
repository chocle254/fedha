import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export const isSupabaseEnabled = () => !!(supabaseUrl && supabaseKey);

// ─── AUTH ─────────────────────────────────────────────────────────────────────
// Single-user app: sign-in only, no sign-up UI. The one allowed account is
// created directly in the Supabase dashboard (Authentication → Users), and
// public sign-ups should be switched off there too — see
// supabase-migration-2-auth.sql for the exact steps.
export async function signIn(email, password) {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase.auth.signInWithPassword({ email, password });
}
export async function signOut() {
  if (!supabase) return;
  return supabase.auth.signOut();
}
export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session ?? null;
}
// Returns an unsubscribe function.
export function onAuthChange(cb) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

// Push local data to Supabase
export async function syncToSupabase(table, records) {
  if (!supabase) return;
  const unsynced = records.filter((r) => !r.synced);
  if (!unsynced.length) return;
  const { error } = await supabase
    .from(table)
    .upsert(unsynced.map((r) => ({ ...r, synced: true })));
  return error;
}

// Pull data from Supabase
export async function fetchFromSupabase(table) {
  if (!supabase) return [];
  const { data, error } = await supabase.from(table).select('*');
  if (error) return [];
  return data;
}
