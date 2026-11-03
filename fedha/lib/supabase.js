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
// The saved login on this phone, read straight from storage (supabase-js keeps it as sb-<project>-auth-token).
function storedSession() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (/^sb-.+-auth-token$/.test(k)) { const v = JSON.parse(localStorage.getItem(k) || 'null'); if (v?.user && v?.refresh_token) return v; }
    }
  } catch { /* storage blocked */ }
  return null;
}

// Offline with an expired token, supabase-js cannot refresh it and answers "no session" (while keeping the login
// saved). That used to send you to the login page, which cannot load offline. So: when the refresh failed because
// there is no network, carry on with the saved login; the token refreshes by itself once you're back online.
export async function getSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (data?.session) return data.session;
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const network = error && (error.name === 'AuthRetryableFetchError' || /fetch|network|failed to fetch|load failed/i.test(error.message || ''));
  if (offline || network) return storedSession();
  return null;
}
// Returns an unsubscribe function.
export function onAuthChange(cb) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    // Offline, a failed token refresh can report no session; keep the saved login unless you really signed out.
    if (!session && event !== 'SIGNED_OUT' && typeof navigator !== 'undefined' && navigator.onLine === false) { cb(storedSession()); return; }
    cb(session);
  });
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
