# Setting up real push notifications (free)

This makes Fedha send push notifications even when the app is fully closed,
using only free services: Web Push (built into every browser, no account
needed) + Supabase's free tier (Postgres + Edge Functions + pg_cron).

## 1. VAPID keys (free, no account — you generate these yourself)

I already generated a pair for you locally:

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BCRQObppfjPSsVGm5ug7vdRLOz6Puqif3co1ZHoZ7eYWaB8Djkvh9wgVEeryS1Ef6nTQgL2cpAyqqwF9RISafjo
VAPID_PRIVATE_KEY=nf0O-awC76TqB2qtST5wxH-nOdWK3zlMlDqhV8qKMqw
```

These are **not from any Anthropic or third-party account** — VAPID keys are
just a public/private key pair you generate yourself for Web Push, like an
SSH key. Nobody issues them; there's no dashboard to sign up for. If you'd
rather generate your own fresh pair instead of using mine (recommended,
since mine were shown in this chat):

```bash
cd fedha
npx web-push generate-vapid-keys
```

Keep the private key secret — never put it in `NEXT_PUBLIC_*` or commit it.

## 2. Supabase project (free tier)

If you don't already have one for this app's existing Supabase integration:
1. Go to https://supabase.com → sign up (free) → "New project"
2. Once created, go to **Project Settings → API** to get:
   - `Project URL` → this is your `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → this is your `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key (under the same page, click to reveal) → used only
     server-side by the Edge Function, never exposed to the browser

If you already had Supabase set up for Fedha's existing sync feature, reuse
that same project.

## 3. Run the new SQL migration

In the Supabase dashboard: **SQL Editor → New query**, paste the contents of
`supabase-push-schema.sql`, but first:

- Replace `<PROJECT_REF>` with your project ref (the subdomain in your
  Project URL, e.g. `abcdefghij` from `https://abcdefghij.supabase.co`)
- Replace `<ANON_KEY>` with your anon public key from step 2

Then run it. This creates the `push_subscriptions`, `reminder_settings`, and
`push_sent_log` tables, and schedules a `pg_cron` job that pings your Edge
Function every minute (both `pg_cron` and `pg_net` are free, built-in
Supabase extensions — no extra cost or signup).

## 4. Deploy the Edge Function

You'll need the Supabase CLI (free):

```bash
npm install -g supabase
supabase login                      # opens a browser to authenticate — free
supabase link --project-ref <PROJECT_REF>
supabase functions deploy send-reminders
```

Then set its secrets (Project Settings → Edge Functions → send-reminders →
Secrets, or via CLI):

```bash
supabase secrets set VAPID_PUBLIC_KEY=BCRQObppfjPSsVGm5ug7vdRLOz6Puqif3co1ZHoZ7eYWaB8Djkvh9wgVEeryS1Ef6nTQgL2cpAyqqwF9RISafjo
supabase secrets set VAPID_PRIVATE_KEY=nf0O-awC76TqB2qtST5wxH-nOdWK3zlMlDqhV8qKMqw
supabase secrets set VAPID_SUBJECT=mailto:youremail@example.com
supabase secrets set TZ_OFFSET_MINUTES=180
```

- `VAPID_SUBJECT` just needs to be a `mailto:` address — it's how push
  services can contact you if your server misbehaves. Any email works.
- `TZ_OFFSET_MINUTES=180` is East Africa Time (UTC+3). Adjust if you're
  somewhere else (e.g. `0` for UTC, `-300` for US Eastern in winter).
  `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already available to
  every Edge Function automatically — you don't need to set those.

## 5. Set the app's environment variables

Wherever Fedha is deployed (Vercel, based on the `vercel.json` in this repo),
add:

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BCRQObppfjPSsVGm5ug7vdRLOz6Puqif3co1ZHoZ7eYWaB8Djkvh9wgVEeryS1Ef6nTQgL2cpAyqqwF9RISafjo
```

(Your `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` should
already be set from the existing sync feature — if not, add those too.)

Redeploy after adding the variable.

## 6. Try it

1. Open the deployed app, go to **Planner**, tap to enable notifications
   (grant the browser permission prompt).
2. In Supabase → Table Editor → `push_subscriptions`, confirm a row appeared.
3. Close the app completely (swipe it away / close the tab).
4. Wait for a scheduled meal or planner block time — the notification should
   arrive with the app closed, tapping it reopens Fedha.

To sanity-check the function itself without waiting, you can invoke it
manually from the Supabase dashboard (Edge Functions → send-reminders →
"Invoke") — it'll report `{ ok: true, sent: N, skipped: N }` in the logs.

## Costs — everything above is free at this scale

- **VAPID / Web Push**: free forever, it's an open protocol handled by
  Chrome/Firefox/Edge's own push infrastructure — not FCM or APNs, no paid
  tier exists.
- **Supabase free tier**: 500K Edge Function invocations/month (this uses
  ~43,200/month at one call per minute), 500MB database, both far more than
  this app needs.
- If you ever exceed Supabase's free tier limits (unlikely for personal
  use), the next tier is a paid Pro plan — but nothing here requires it.
