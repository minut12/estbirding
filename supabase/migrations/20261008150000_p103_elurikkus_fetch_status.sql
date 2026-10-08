-- 20261008150000_p103_elurikkus_fetch_status.sql
-- P103: Linnuliigid "Andmed viimati uuendatud (server)" showed linnuliigid_snapshot.generated_at,
-- i.e. when a visitor's map last triggered a snapshot rebuild (15-min cooldown), not when the
-- cron fetched elurikkus.ee. This RPC exposes the real server fetch times from cron_runs + cron.job.
--   last_fetch_at = newest finished ok run of elurikkus (full) or elurikkus_recent (30-min feed)
--   last_full_at  = start of the newest fully-ok full run (job 'elurikkus')
--   next_full_at  = next fire time of the m7-elurikkus* full-run jobs (simple "M H[,H] * * *" schedules, UTC)
create or replace function public.get_elurikkus_fetch_status()
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public', 'pg_catalog'
as $function$
  with full_run as (
    select run_id, min(started_at) as st
    from public.cron_runs
    where job = 'elurikkus' and started_at > now() - interval '3 days'
    group by run_id
    having bool_and(ok)
    order by st desc
    limit 1
  ),
  cand as (
    select (v.d + make_interval(hours => h::int, mins => split_part(j.schedule, ' ', 1)::int)) at time zone 'UTC' as t
    from cron.job j,
         unnest(string_to_array(split_part(j.schedule, ' ', 2), ',')) h,
         (values ((now() at time zone 'UTC')::date::timestamp),
                 ((now() at time zone 'UTC')::date::timestamp + interval '1 day')) v(d)
    where j.active
      and j.jobname in ('m7-elurikkus', 'm7-elurikkus-1130', 'm7-elurikkus-pm')
      and split_part(j.schedule, ' ', 3) = '*'
      and split_part(j.schedule, ' ', 1) ~ '^\d+$'
      and h ~ '^\d+$'
  )
  select jsonb_build_object(
    'last_fetch_at', (select max(finished_at) from public.cron_runs
                      where job in ('elurikkus', 'elurikkus_recent') and ok
                        and started_at > now() - interval '3 days'),
    'last_full_at',  (select st from full_run),
    'next_full_at',  (select min(t) from cand where t > now())
  );
$function$;

revoke execute on function public.get_elurikkus_fetch_status() from public;
grant execute on function public.get_elurikkus_fetch_status() to anon, authenticated;
