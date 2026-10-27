-- Ziidi pockets inside a Safaricom wallet: a child wallet for Ziidi and one for Ziidi Locked (savings).
alter table wallets add column if not exists parent_id text references wallets(id) on delete set null;
alter table wallets add column if not exists pocket text check (pocket in ('ziidi','ziidi_locked'));
create index if not exists wallets_parent on wallets (parent_id);
