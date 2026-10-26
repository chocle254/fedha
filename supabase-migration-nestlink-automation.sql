-- Start/stop switch for the NestLink automatic sweep (one row, server-side only).
create table if not exists public.nestlink_automation (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  last_sweep jsonb,
  pending jsonb not null default '[]'::jsonb
);
insert into public.nestlink_automation (id) values (1) on conflict (id) do nothing;
-- RLS on with no policies: only the service role (Fedha's API routes) can read or write it.
alter table public.nestlink_automation enable row level security;
-- If the table already existed before the payout-credit feature, add the new column:
alter table public.nestlink_automation add column if not exists pending jsonb not null default '[]'::jsonb;
-- UpesiPay zero-balance alert state:
alter table public.nestlink_automation add column if not exists wallet_alert jsonb;
