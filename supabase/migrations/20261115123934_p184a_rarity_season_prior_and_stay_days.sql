-- 20261115_p184a_rarity_season_prior_and_stay_days.sql
-- P184a DRAFT -- NOT APPLIED. Apply only after Kristian's explicit go, then verify as anon,
-- then commit this exact file to supabase/migrations/.
--
-- Two read-only aggregate RPCs for the Ennustus rework (P184):
--   rarity_season_prior  -> Hooaeg list: in how many past years was the species recorded in
--                           Estonia within +-p_halfwidth days of p_date (HK accepted + Elurikkus).
--   rarity_stay_days     -> Juba Eestis: how long single birds usually stay at one site.
-- Both return counts only (no localities, no coordinates), so SECURITY DEFINER over
-- elurikkus_observations (RLS on, no policies) exposes nothing site-level.
-- Rows outside the Estonian bounding box (59 elurikkus rows with swapped / truncated
-- coordinates, audit F25) are excluded.

create or replace function public.rarity_season_prior(
  p_species    text[],
  p_date       date default (now() at time zone 'Europe/Tallinn')::date,
  p_halfwidth  int  default 14
)
returns table(
  species_et                  text,
  years_in_window_since_1990  int,
  years_in_window_last10      int,
  years_any_time              int,
  last_year_in_window         int,
  years_by_month              int[]
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with src as (
    select e.species_name as sp,
           extract(year from e.observed_at)::int as yr,
           extract(doy  from e.observed_at)::int as doy
    from public.elurikkus_observations e
    where e.species_name = any(p_species)
      and cardinality(p_species) <= 500
      and e.observed_at >= date '1990-01-01'
      and e.observed_at <  date_trunc('year', p_date)::date
      and e.lat between 57.3 and 60.0
      and e.lon between 21.3 and 28.3
    union all
    select s.et_name,
           h.year,
           extract(doy from h.date_from)::int
    from public.hk_records h
    join public.hk_species s on s.taxon_sci = h.taxon_sci
    where h.status = 'accepted'
      and h.date_from is not null
      and s.et_name = any(p_species)
      and cardinality(p_species) <= 500
      and h.year >= 1990
      and h.date_from < date_trunc('year', p_date)::date
  ),
  win as (
    select src.*,
           least(abs(src.doy - extract(doy from p_date)::int),
                 365 - abs(src.doy - extract(doy from p_date)::int)) as dd,
           extract(month from (date '2001-01-01' + (src.doy - 1)))::int as mon
    from src
  ),
  months as (
    select w.sp, m.m, count(distinct w.yr) filter (where w.mon = m.m)::int as n
    from (select distinct sp from win) s0
    join win w on w.sp = s0.sp
    cross join generate_series(1, 12) as m(m)
    group by w.sp, m.m
  )
  select w.sp,
         (count(distinct w.yr) filter (where w.dd <= p_halfwidth))::int,
         (count(distinct w.yr) filter (where w.dd <= p_halfwidth
                                         and w.yr >= extract(year from p_date)::int - 10))::int,
         (count(distinct w.yr))::int,
         (max(w.yr) filter (where w.dd <= p_halfwidth))::int,
         (select array_agg(mo.n order by mo.m) from months mo where mo.sp = w.sp)
  from win w
  group by w.sp;
$function$;

create or replace function public.rarity_stay_days(
  p_species text[]
)
returns table(
  species_et   text,
  n_birds      int,
  median_days  int,
  pct_over_3d  int,
  max_days     int
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  -- One "bird" = same species, same ~25 km cell (0.25 deg lat x 0.5 deg lon),
  -- consecutive records no more than 3 days apart.
  with pts as (
    select distinct e.species_name as sp,
           round(e.lat::numeric * 4) as la,
           round(e.lon::numeric * 2) as lo,
           e.observed_at as d
    from public.elurikkus_observations e
    where e.species_name = any(p_species)
      and cardinality(p_species) <= 500
      and e.observed_at >= date '2000-01-01'
      and e.lat between 57.3 and 60.0
      and e.lon between 21.3 and 28.3
  ),
  g as (
    select pts.*,
           case when d - lag(d) over (partition by sp, la, lo order by d) <= 3 then 0 else 1 end as brk
    from pts
  ),
  runs as (
    select g.*, sum(brk) over (partition by sp, la, lo order by d) as run_id from g
  ),
  birds as (
    select sp, (max(d) - min(d) + 1) as days from runs group by sp, la, lo, run_id
  )
  select sp,
         count(*)::int,
         (percentile_disc(0.5) within group (order by days))::int,
         round(100.0 * avg((days > 3)::int))::int,
         max(days)::int
  from birds
  group by sp;
$function$;

revoke all on function public.rarity_season_prior(text[], date, int) from public;
revoke all on function public.rarity_stay_days(text[]) from public;
grant execute on function public.rarity_season_prior(text[], date, int) to anon, authenticated, service_role;
grant execute on function public.rarity_stay_days(text[]) to anon, authenticated, service_role;

-- Verify after apply (as anon):
--   select * from public.rarity_season_prior(array['Tundrakaur','Jääkaur','Tundrarüüt'], date '2026-11-15', 14);
--   expect Tundrakaur years_in_window_since_1990 = 3, Jääkaur 0, Tundrarüüt 0 (Tundrarüüt years_by_month Aug 2, Sep 1)
--   select * from public.rarity_stay_days(array['Kõrbe-kivitäks','Punakael-lagle']);
--   expect Kõrbe-kivitäks n_birds 5 median 2; Punakael-lagle n_birds 74 median 1
