-- 20261007104500_p96_m7_elurikkus_autumn_times.sql
-- P96: m7-elurikkus full sweep moved to Kristian's autumn times (Tallinn local 07:15, 11:30, 15:00, 21:00).
-- pg_cron runs in GMT. Summer time (UTC+3, until 25 Oct 2026): 04:15, 08:30, 12:00, 18:00 UTC.
-- Different minutes -> three jobs, same command. Winter re-time (05:15/09:30/13:00/19:00 UTC) is a separate change after 25 Oct.
select cron.alter_job(
  job_id   := (select jobid from cron.job where jobname = 'm7-elurikkus'),
  schedule := '15 4 * * *'
);
select cron.schedule('m7-elurikkus-1130', '30 8 * * *',
  $$select public.m7_call_ef('batch-driver', '{"job":"elurikkus"}')$$);
select cron.schedule('m7-elurikkus-pm', '0 12,18 * * *',
  $$select public.m7_call_ef('batch-driver', '{"job":"elurikkus"}')$$);
