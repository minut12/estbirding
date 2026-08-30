-- M7.2: pg_cron + pg_net scheduling for the jobs that used to run in n8n Cloud.
--
-- Replaces four schedule-only n8n workflows:
--   compute-ennustus-scheduler v2      -> m7-ennustus  -> batch-driver {job:'ennustus'}
--   elurikkus-bulk-refresh-scheduler   -> m7-elurikkus -> batch-driver {job:'elurikkus'}
--   gbif-history-refresh (weekly)      -> m7-gbif      -> batch-driver {job:'gbif'}
--   UFO Sightings CO+PA+I70            -> m7-ufo       -> ufo-refresh {}
--
-- Schedules are UTC. Tallinn summer time is UTC+3, winter UTC+2, so the wall-clock
-- time these jobs fire drifts by 1 h across the DST boundary. Accepted (2026-08-30).

create extension if not exists pg_cron with schema pg_catalog;   -- Supabase installs cron objects into schema "cron"
create extension if not exists pg_net with schema extensions;

-- Run log: one row per driver invocation (a job that self-chains writes several
-- rows sharing run_id, distinguished by hop).
create table if not exists public.cron_runs (
  id bigserial primary key,
  job text not null,
  run_id uuid not null,
  hop int not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  calls int not null default 0,
  ok boolean,
  state jsonb,
  error text
);
create index if not exists cron_runs_job_started_idx on public.cron_runs (job, started_at desc);
alter table public.cron_runs enable row level security;   -- service role only; no policies

-- Helper: POST to an Edge Function with the shared webhook secret from Vault.
-- The secret row is created manually (see B0), never in a migration.
create or replace function public.m7_call_ef(fn text, body jsonb)
returns bigint language sql security definer set search_path = public, extensions, vault as $$
  select net.http_post(
    url := 'https://rfjhrosxbaihyrnbmmbl.supabase.co/functions/v1/' || fn,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'vaatluste_webhook_secret')
    ),
    body := body,
    timeout_milliseconds := 30000
  );
$$;
revoke all on function public.m7_call_ef(text, jsonb) from public, anon, authenticated;
-- batch-driver self-chains by calling this over PostgREST with the service-role key.
grant execute on function public.m7_call_ef(text, jsonb) to service_role;

-- Schedules (UTC; Tallinn summer = +3). Names are stable so cron.unschedule(name) works.
select cron.schedule('m7-ennustus',  '0 4,16 * * *',  $$select public.m7_call_ef('batch-driver', '{"job":"ennustus"}')$$);
select cron.schedule('m7-elurikkus', '15 2,14 * * *', $$select public.m7_call_ef('batch-driver', '{"job":"elurikkus"}')$$);
select cron.schedule('m7-gbif',      '0 1 * * 0',     $$select public.m7_call_ef('batch-driver', '{"job":"gbif"}')$$);
select cron.schedule('m7-ufo',       '0 */6 * * *',   $$select public.m7_call_ef('ufo-refresh',  '{}')$$);
