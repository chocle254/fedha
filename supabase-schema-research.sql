-- ─── RESEARCH LOG ────────────────────────────────────────────────────────────
-- Run this in the Supabase SQL editor to add the Research feature.
-- Follows the same jsonb "data blob" shape lib/db.js's jsonStore() already
-- uses for hackathons/projects/startups/etc: flat columns for anything
-- filtered/sorted on directly, everything else in `data`.
create table if not exists research (
  id text primary key,
  category text,                 -- 'job' | 'hackathon' | 'tech' | 'general' — lifted for filtering
  data jsonb default '{}',       -- { title, notes, findings, link, tags, linked_type, linked_id, status }
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete cascade,
  synced boolean default true
);

alter table research enable row level security;

create policy "Users can manage own research" on research for all using (auth.uid() = user_id);
