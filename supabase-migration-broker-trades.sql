-- MT5 demo accounts (XM, LiteFinance) driven through MetaApi. One row per MT5 position:
-- a signal with 6 TPs becomes up to 6 rows that share signal_key, each with its own TP.
create table if not exists broker_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  account text not null,                -- 'xm' | 'litefinance'
  signal_key text not null,             -- Telegram chat:message id, shared by every leg of one signal
  signal_id uuid references trade_signals(id) on delete set null,
  source text not null,                 -- Telegram channel
  symbol text not null,                 -- broker symbol, e.g. GOLD (XM) or XAUUSD
  side text not null,                   -- BUY | SELL
  order_type text not null,             -- market | limit
  leg int not null,                     -- 1 = TP1, 2 = TP2 ...
  legs int not null,
  lots numeric not null,
  entry numeric,                        -- requested (limit) or filled price
  stop_loss numeric,
  take_profit numeric,
  risk_usd numeric not null,            -- risk of the WHOLE signal on this account (all legs), for R maths
  lot_multiplier numeric,
  confidence int,
  order_id text,                        -- MT5 ticket; the position id is the same number once filled
  status text not null default 'pending', -- pending | open | won | lost | cancelled | failed
  close_price numeric,
  profit numeric,                       -- realised, incl. commission and swap
  close_reason text,                    -- tp | sl | manual | expired | ...
  error text,
  breakeven boolean not null default false,
  created_at timestamptz not null default now(),
  filled_at timestamptz,
  closed_at timestamptz
);
create unique index if not exists broker_trades_leg on broker_trades (user_id, account, signal_key, leg);
create index if not exists broker_trades_live on broker_trades (user_id, status);
create index if not exists broker_trades_source on broker_trades (user_id, source);
alter table broker_trades enable row level security;
drop policy if exists "Users can read own broker_trades" on broker_trades;
create policy "Users can read own broker_trades" on broker_trades for select using (auth.uid() = user_id);

-- Per-account switches and risk, e.g. {"xm":{"enabled":true,"risk_pct":1,"min_confidence":0,"daily_loss_pct":5}}
alter table trade_settings add column if not exists broker_settings jsonb;
