// Server-side guard for the AI routes. They spend the Groq / NVIDIA free
// quota, so only the signed-in Fedha user may call them — otherwise anyone
// who finds the URL can burn through the per-minute limits (which then shows
// up as Jarvis being "rate limited"). Returns the user, or sends 401 and
// returns null.
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const client = url && anon ? createClient(url, anon, { auth: { persistSession: false } }) : null;

export async function requireUser(req, res) {
  if (!client) return { id: 'local' }; // Supabase not configured (local dev): nothing to check against
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (token) {
    const { data, error } = await client.auth.getUser(token);
    if (!error && data?.user) return data.user;
  }
  res.status(401).json({ error: 'Please sign in again.' });
  return null;
}
