-- Lets the Telegram listener de-duplicate messages (chatId:messageId).
alter table trade_signals add column if not exists external_id text;
create unique index if not exists trade_signals_user_external on trade_signals (user_id, external_id) where external_id is not null;
