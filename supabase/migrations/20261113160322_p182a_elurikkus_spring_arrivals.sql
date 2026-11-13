-- P182a (2026-11-13): one-pass aggregate behind the edge function
-- get-elurikkus-arrivals-2026. Replaces its 1000-row paged scan (capped at
-- 100k rows, which cut the year off at mid-April).
--
-- Returns a jsonb array, one element per species seen since 1 Dec of the
-- previous year:
--   species_name    text
--   obs_count       int     rows in the scanned window (for telemetry)
--   has_winter_obs  bool    any obs in 1 Dec (p_year-1) .. 15 Jan p_year inclusive
--   first_obs_date  date    first obs on/after 1 Jan p_year, null when none
--   locality, county, observer   of that first record
-- First record = earliest observed_at; ties broken by observed_dt (nulls last)
-- then id, so the pick is deterministic (the old scan had no tie-break).
-- p_year null = current year in Europe/Tallinn.
-- jsonb (not setof) so PostgREST row caps cannot truncate it.
-- Server-only: EXECUTE for service_role only.

create or replace function public.get_elurikkus_spring_arrivals(p_year integer default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $function$
  with y as (
    select coalesce(p_year, extract(year from (now() at time zone 'Europe/Tallinn'))::int) as yr
  ),
  b as (
    select make_date(yr - 1, 12, 1) as w0,
           make_date(yr, 1, 1)      as y0,
           make_date(yr, 1, 15)     as w1,
           make_date(yr + 1, 1, 1)  as y1
    from y
  ),
  agg as (
    select o.species_name as sp,
           count(*)::int as n,
           bool_or(o.observed_at <= b.w1) as has_winter_obs,
           min(o.observed_at) filter (where o.observed_at >= b.y0) as d
    from public.elurikkus_observations o, b
    where o.observed_at >= b.w0 and o.observed_at < b.y1
      and o.species_name <> ''
    group by 1
  ),
  -- Only the rows of each species' first day are fetched (index lookup on
  -- (species_name, observed_at)), so no big sort is needed for the tie-break.
  first_rec as (
    select distinct on (o.species_name)
           o.species_name as sp, o.locality, o.county, o.observer
    from agg
    join public.elurikkus_observations o
      on o.species_name = agg.sp and o.observed_at = agg.d
    order by o.species_name, o.observed_dt nulls last, o.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'species_name', agg.sp,
           'obs_count', agg.n,
           'has_winter_obs', agg.has_winter_obs,
           'first_obs_date', agg.d,
           'locality', f.locality,
           'county', f.county,
           'observer', f.observer
         ) order by agg.d nulls last, agg.sp), '[]'::jsonb)
  from agg left join first_rec f using (sp);
$function$;

revoke all on function public.get_elurikkus_spring_arrivals(integer) from public, anon, authenticated;
grant execute on function public.get_elurikkus_spring_arrivals(integer) to service_role;
