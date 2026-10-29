-- SMS capture (Android app): M-Pesa and Ziidi texts forwarded by the phone, with the SIM they arrived on and how
-- Luxe read them. Only messages from M-Pesa / Ziidi senders are ever sent. Written by the server (service role).
-- Privacy: the message text (body) is wiped as soon as the transaction is recorded, and after 7 days at the latest.
-- What stays is the M-Pesa code (so the same transaction is never counted twice) and the parsed facts.
create table if not exists sms_inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  sender text not null,
  body text,                    -- wiped once recorded / after 7 days
  sim_slot int,                 -- 1 or 2 (null when the phone could not tell)
  received_at timestamptz not null,
  code text,                    -- M-Pesa transaction code, e.g. SJK1ABC2DE
  fingerprint text not null,    -- hash of sender + time + text, for duplicates when there is no code
  parsed jsonb,                 -- { kind, amount, party, balance, cost, ... } or null when not understood
  wallet_id text,               -- which Luxe wallet it belongs to (from the SIM, or the message for Ziidi)
  status text not null default 'captured', -- captured | recorded | ignored | unparsed
  transaction_id text,
  created_at timestamptz not null default now()
);
create unique index if not exists sms_inbox_fp on sms_inbox (user_id, fingerprint);
create index if not exists sms_inbox_user_time on sms_inbox (user_id, received_at desc);
alter table sms_inbox enable row level security;
create policy "own sms" on sms_inbox for select using (auth.uid() = user_id);
