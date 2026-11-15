-- 20261115_p184c2_rarity_season_prior_null_coords.sql
-- P184c2 DRAFT -- NOT APPLIED. Apply only after Kristian's explicit go, verify as anon,
-- then commit this exact file to supabase/migrations/ under the version apply_migration returns.
--
-- rarity_season_prior counted only Elurikkus rows WITH coordinates inside Estonia, so the
-- 24 045 undated-location rows from the P184c history import (all country = Estonia, many
-- literature records) were ignored and Hooaeg year counts were about half of the truth
-- (Punakurk-kaur 16 -> 29 years, Mannikabilind 10 -> 17, Tundrakaur 1 -> 5 at 15 Nov).
-- Change 1: a row with NO coordinates counts; a row with coordinates outside the Estonian
--           bounding box still does not (bad / swapped coordinates, audit F25).
-- Change 2: 1 January dates are skipped (year-only records are stored as YYYY-01-01).
-- Signature, return shape and grants are unchanged.

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
      and not (extract(month from e.observed_at) = 1 and extract(day from e.observed_at) = 1)
      and (e.lat is null or (e.lat between 57.3 and 60.0 and e.lon between 21.3 and 28.3))
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
