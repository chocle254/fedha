-- Every message the Telegram listener forwards, with what happened to it (so skipped signals are visible on the Trading page).
create table if not exists signal_inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  source text,
  text text,
  external_id text,
  outcome text not null,           -- tracked | traded | duplicate | stale | unparsed | follow_up
  detail text,
  signal_id uuid references trade_signals(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists signal_inbox_user_created on signal_inbox (user_id, created_at desc);
alter table signal_inbox enable row level security;
create policy "Users can read own signal_inbox" on signal_inbox for select using (auth.uid() = user_id);

-- Listener heartbeat, so the page can show whether Telegram is connected.
alter table trade_settings add column if not exists listener_seen_at timestamptz;
alter table trade_settings add column if not exists listener_stats jsonb;
