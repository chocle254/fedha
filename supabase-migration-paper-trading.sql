-- Paper trading: per-user automation settings and simulated trades. No real orders are ever placed from these tables.
create table if not exists trade_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  auto_enabled boolean not null default false,
  mode text not null default 'paper' check (mode in ('paper')),
  risk_usdt numeric not null default 10 check (risk_usdt > 0),
  min_rr numeric not null default 0 check (min_rr >= 0),
  updated_at timestamptz not null default now()
);
alter table trade_settings enable row level security;
create policy "Users can manage own trade_settings" on trade_settings for all using (auth.uid() = user_id);

create table if not exists paper_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  signal_id uuid references trade_signals(id) on delete set null,
  source text,
  symbol text not null,
  side text not null check (side in ('BUY','SELL')),
  mode text not null default 'paper' check (mode in ('paper')),
  auto boolean not null default false,
  entry numeric not null,
  stop_loss numeric,
  take_profits jsonb not null default '[]',
  qty numeric not null,
  notional numeric not null,
  risk_usdt numeric not null,
  actual_risk_usdt numeric,
  min_forced boolean not null default false,
  status text not null default 'open' check (status in ('pending','open','won','lost','expired')),
  tp_hit integer not null default 0,
  pnl_usdt numeric,
  last_price numeric,
  max_adverse_price numeric,
  max_favorable_price numeric,
  max_drawdown_usdt numeric,
  max_drawdown_r numeric,
  filled_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists paper_trades_user_created on paper_trades (user_id, created_at desc);
create unique index if not exists paper_trades_user_signal on paper_trades (user_id, signal_id) where signal_id is not null;
alter table paper_trades enable row level security;
create policy "Users can manage own paper_trades" on paper_trades for all using (auth.uid() = user_id);
