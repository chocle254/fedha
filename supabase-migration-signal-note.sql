-- Why a tracked signal was not paper-traded (shown on the Signals tab).
alter table trade_signals add column if not exists note text;
