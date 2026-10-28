-- Luxe: lets paper trades on yen / CAD / CHF quoted forex pairs (USDJPY, GBPJPY, EURJPY, USDCAD, USDCHF)
-- report profit and risk in US dollars. quote_usd = US dollars per 1 unit of the quote currency at entry
-- (1 for USD-quoted markets and crypto, so existing trades are unchanged). Safe to run more than once.
alter table public.paper_trades add column if not exists quote_usd numeric not null default 1;
