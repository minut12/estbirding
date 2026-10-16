-- P150 (2026-10-16): the three Ulevaade report jobs run once a day at 18:00 Tallinn
-- instead of twice (06:00 + 18:00). pg_cron runs in UTC: 15:xx UTC = 18:xx EEST.
-- When EET starts (2026-10-25) these move to 16:xx UTC to stay at 18:00 local.
-- Applied live via the Supabase connector before this file was committed.
-- Note: ennustus-prediction-outcomes (40 3 * * *) now scores the previous evening's
-- toenaosus raport; it keeps its one-day due window, so nothing else changes.
select cron.alter_job((select jobid from cron.job where jobname = 'm7-vaatluste-raport'), schedule := '0 15 * * *');
select cron.alter_job((select jobid from cron.job where jobname = 'm7-elurikkus-raport'), schedule := '5 15 * * *');
select cron.alter_job((select jobid from cron.job where jobname = 'm7-toenaosus-raport'), schedule := '10 15 * * *');
