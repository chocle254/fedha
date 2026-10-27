-- Editable paper balance, risk as % of balance, and spread tracking.
alter table trade_settings add column if not exists paper_balance numeric not null default 1000 check (paper_balance > 0);
alter table trade_settings add column if not exists risk_mode text not null default 'percent' check (risk_mode in ('percent','fixed'));
alter table trade_settings add column if not exists risk_pct numeric not null default 1 check (risk_pct > 0 and risk_pct <= 25);

alter table paper_trades add column if not exists spread_abs numeric not null default 0;
alter table paper_trades add column if not exists spread_pct numeric;
alter table paper_trades add column if not exists equity_at_entry numeric;
