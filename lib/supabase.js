import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export const isSupabaseEnabled = () => !!(supabaseUrl && supabaseKey);

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
