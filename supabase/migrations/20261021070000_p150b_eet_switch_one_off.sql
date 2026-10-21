-- P150b (2026-10-21): keep the three Ulevaade report jobs at 18:00 Tallinn after the
-- switch to winter time (EET, 2026-10-25 01:00 UTC). A one-off pg_cron job at
-- 2026-10-25 01:30 UTC moves them from 15:xx UTC to 16:xx UTC and then unschedules itself.
-- Applied live via the Supabase connector before this file was committed.
-- Back to 15:xx UTC when EEST starts again (2027-03-28) -- not scheduled yet.
select cron.schedule('p150b-eet-switch-2026', '30 1 25 10 *', $job$
select cron.alter_job((select jobid from cron.job where jobname = 'm7-vaatluste-raport'), schedule := '0 16 * * *');
select cron.alter_job((select jobid from cron.job where jobname = 'm7-elurikkus-raport'), schedule := '5 16 * * *');
select cron.alter_job((select jobid from cron.job where jobname = 'm7-toenaosus-raport'), schedule := '10 16 * * *');
select cron.unschedule('p150b-eet-switch-2026');
$job$);
