-- p178d7_ext_rare_refresh_cron.sql
-- P178: ext-rare-refresh twice a day, right after ebird-europe-refresh (03:45 / 15:45 UTC)
-- so the merge sees fresh eBird rows; before the 18:00 Tallinn Ulevaade report.
select cron.schedule('m7-ext-rare-refresh', '20 4,16 * * *',
  $$select public.m7_call_ef('ext-rare-refresh', '{"mode":"run"}'::jsonb)$$);
