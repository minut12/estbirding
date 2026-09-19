-- P46a-randeajad-rpc.sql
-- Migration name: p46a_get_species_week_histograms
-- NOT APPLIED. Apply only after Kristian's explicit go.
--
-- One call returns weekly observation counts for every species:
--   { "<species_name>": [[week, n], ...], ... }   week = 1..52 (week 53 folded into 52)
-- Single jsonb row -> PostgREST row cap does not apply.
-- Measured 2026-09-19 (read-only): 398 species, 10 475 cells, ~103 KB, ~510 ms
-- (Parallel Index Only Scan on idx_elurikkus_obs_species_observed).
-- Aggregated counts only: no coordinates, no observers, no localities.

create or replace function public.get_species_week_histograms()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(species_name, h), '{}'::jsonb)
  from (
    select species_name,
           jsonb_agg(jsonb_build_array(w, n) order by w) as h
    from (
      select species_name,
             least(52, ((extract(doy from observed_at)::int - 1) / 7) + 1) as w,
             count(*) as n
      from public.elurikkus_observations
      where observed_at is not null
        and species_name is not null
      group by 1, 2
    ) t
    group by species_name
  ) s;
$$;

revoke all on function public.get_species_week_histograms() from public;
grant execute on function public.get_species_week_histograms() to anon, authenticated, service_role;

-- Verify after apply (paste output back):
--   select jsonb_typeof(r) t, (select count(*) from jsonb_object_keys(r)) species, length(r::text) bytes
--   from public.get_species_week_histograms() r;
--   -- expect: object, ~398, ~105000
--   select public.get_species_week_histograms() -> 'Sookurg';
--   -- expect week 13 = 935 (or higher; table grows twice a day)
--
-- Rollback:
--   drop function if exists public.get_species_week_histograms();
