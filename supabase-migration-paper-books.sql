-- Paper trades belong to a "book": 'main' (the $1,000 account that trades every signal, so every channel is
-- measured) or 'growth' (the small growth-challenge account that only takes trades its balance supports).
-- One signal can have one trade per book.
alter table paper_trades add column if not exists book text not null default 'main';
drop index if exists paper_trades_user_signal;
create unique index if not exists paper_trades_user_signal_book on paper_trades (user_id, signal_id, book) where signal_id is not null;
