-- The pg_cron run log (cron.job_run_details) grows ~2 MB a day: two jobs run every minute and nothing clears it.
-- Run once in the Supabase SQL editor: frees the old log and keeps only the last 3 days from now on.
delete from cron.job_run_details where end_time < now() - interval '3 days';
select cron.schedule('fedha-clean-cron-log', '15 3 * * *', $$delete from cron.job_run_details where end_time < now() - interval '3 days'$$);
