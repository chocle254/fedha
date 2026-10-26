-- Paper-tracked Telegram trading signals (no real orders are placed from this table).
create table if not exists trade_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  source text not null,
  raw_text text,
  symbol text not null,
  side text not null check (side in ('BUY','SELL')),
  entry numeric not null,
  entry_low numeric,
  entry_high numeric,
  take_profits jsonb not null default '[]',
  stop_loss numeric,
  market_price numeric,
  status text not null default 'open' check (status in ('pending','open','won','lost','expired')),
  tp_hit integer not null default 0,
  result_pct numeric,
  filled_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists trade_signals_user_created on trade_signals (user_id, created_at desc);

alter table trade_signals enable row level security;
create policy "Users can manage own trade_signals" on trade_signals for all using (auth.uid() = user_id);
