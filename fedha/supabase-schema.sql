-- Run this in your Supabase SQL editor to set up the cloud sync schema
-- All tables mirror the IndexedDB structure for seamless offline→online sync

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ─── WALLETS ──────────────────────────────────────────────────────────────────
create table if not exists wallets (
  id text primary key,
  name text not null,
  type text not null default 'cash',
  balance numeric not null default 0,
  currency text not null default 'KES',
  color text default '#10B981',
  icon text default '💳',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete cascade,
  synced boolean default true
);

-- ─── TRANSACTIONS ──────────────────────────────────────────────────────────────
create table if not exists transactions (
  id text primary key,
  type text not null check (type in ('income', 'expense', 'transfer')),
  amount numeric not null,
  wallet_id text references wallets(id),
  to_wallet_id text references wallets(id),
  category text,
  description text,
  date date not null,
  is_impulse boolean default false,
  currency text default 'KES',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete cascade,
  synced boolean default true
);
create index if not exists transactions_date_idx on transactions(date desc);
create index if not exists transactions_wallet_idx on transactions(wallet_id);

-- ─── BUDGETS ───────────────────────────────────────────────────────────────────
create table if not exists budgets (
  id text primary key,
  name text not null,
  category text,
  allocated numeric not null default 0,
  spent numeric not null default 0,
  period text default 'monthly',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete cascade,
  synced boolean default true
);

-- ─── LOANS ─────────────────────────────────────────────────────────────────────
create table if not exists loans (
  id text primary key,
  type text not null check (type in ('borrowed', 'lent')),
  contact_name text not null,
  amount numeric not null,
  remaining numeric,
  due_date date,
  notes text,
  status text default 'active' check (status in ('active', 'settled')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete cascade,
  synced boolean default true
);

-- ─── GOALS ─────────────────────────────────────────────────────────────────────
create table if not exists goals (
  id text primary key,
  name text not null,
  target numeric not null,
  current numeric default 0,
  deadline date,
  icon text,
  color text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete cascade,
  synced boolean default true
);

-- ─── INCOME PLANS ──────────────────────────────────────────────────────────────
create table if not exists income_plans (
  id text primary key,
  name text not null,
  expected_amount numeric not null,
  expected_date date,
  allocations jsonb default '[]',
  is_received boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete cascade,
  synced boolean default true
);

-- ─── ROW LEVEL SECURITY ────────────────────────────────────────────────────────
-- Enable RLS so each user only sees their own data
alter table wallets enable row level security;
alter table transactions enable row level security;
alter table budgets enable row level security;
alter table loans enable row level security;
alter table goals enable row level security;
alter table income_plans enable row level security;

-- Create RLS policies
create policy "Users can manage own wallets" on wallets for all using (auth.uid() = user_id);
create policy "Users can manage own transactions" on transactions for all using (auth.uid() = user_id);
create policy "Users can manage own budgets" on budgets for all using (auth.uid() = user_id);
create policy "Users can manage own loans" on loans for all using (auth.uid() = user_id);
create policy "Users can manage own goals" on goals for all using (auth.uid() = user_id);
create policy "Users can manage own income_plans" on income_plans for all using (auth.uid() = user_id);
