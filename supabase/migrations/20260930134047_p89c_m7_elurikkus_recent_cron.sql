-- P89c 2026-09-30: recent-feed Elurikkus refresh every 30 min (:05/:35 UTC) via batch-driver job
-- elurikkus_recent (P89b). The 6-hourly full run m7-elurikkus stays unchanged as the safety net.
select cron.schedule(
  'm7-elurikkus-recent',
  '5,35 * * * *',
  $$select public.m7_call_ef('batch-driver','{"job":"elurikkus_recent"}')$$
);
