-- The Desk (lib/desk.js): each signal's score when it arrived, and the desk's small state
-- (real-money switch, the latest market read, the last 7 daily reviews). Both stay small.
alter table trade_signals add column if not exists desk jsonb;
alter table trade_settings add column if not exists desk jsonb;
