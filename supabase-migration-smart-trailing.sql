-- Smart trailing stop: each signal trade remembers the trailing style it uses and the market's volatility (ATR)
-- at entry; trail_stop is the stop in force right now. trail_profiles holds what Fedha learned per channel.
alter table paper_trades add column if not exists trail_mode text;
alter table paper_trades add column if not exists trail_atr numeric;
alter table paper_trades add column if not exists trail_stop numeric;
alter table broker_trades add column if not exists trail_mode text;
alter table broker_trades add column if not exists trail_atr numeric;
alter table broker_trades add column if not exists best_price numeric;
alter table trade_settings add column if not exists trail_profiles jsonb;
