-- P46f-randeajad-coverage.sql
-- Migration name: p46f_species_week_histograms_coverage
-- APPLIED to prod rfjhrosxbaihyrnbmmbl on 2026-09-20 via the Supabase connector,
-- on Kristian's explicit go. This file is the repo record of what is already live.
-- Do NOT re-run it and do NOT connect to Supabase.
--
-- Fixes the partial-year coverage bias. The dataset is effectively 2023-2026;
-- 2026 is 28.8 % of all rows and ends 20 Sep 2026, so weeks 2-38 are built from
-- four years and weeks 39-52 from three. sqrtBirds is now scaled by
-- max_coverage / coverage so under-covered weeks stop being penalised.
--
-- Coverage is an ELAPSED INTERVAL per year (first..last observed week), not
-- per-week presence: counting distinct years with a row in each week reports
-- coverage 3 for weeks 1, 4, 6, 8 and 10 -- sparse gaps in 2023's ramp-up --
-- which injects a comb into early spring. Interval form gives 3 / 4 / 3.
--
-- A "good" year is one holding >= 5 % of the largest annual row count, which
-- admits 2023-2026 and excludes the ~1 900 rows spread over 2000-2022.
-- Self-maintaining: no hardcoded years, recomputes as seasons complete.
--
-- Payload shape is UNCHANGED: [week, records, birds, sqrtBirds].
-- records and birds stay raw; only sqrtBirds is scaled.
-- Measured 2026-09-20 (read-only): 398 species, ~1 683 ms.
-- Rollback: re-apply 20260920090000_p46d_species_week_histograms_birds.sql

create or replace function public.get_species_week_histograms()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with yr as (
    select extract(year from observed_at)::int as y,
           count(*) as c,
           min(least(52, ((extract(doy from observed_at)::int - 1) / 7) + 1)) as min_w,
           max(least(52, ((extract(doy from observed_at)::int - 1) / 7) + 1)) as max_w
    from public.elurikkus_observations
    where observed_at is not null
    group by 1
  ),
  good as (
    select y, min_w, max_w
    from yr
    where c >= 0.05 * (select max(c) from yr)
  ),
  cov as (
    select g.w, count(*)::numeric as ncov
    from generate_series(1, 52) g(w)
    join good on g.w between good.min_w and good.max_w
    group by g.w
  ),
  mx as (select max(ncov) as m from cov),
  agg as (
    select species_name,
           least(52, ((extract(doy from observed_at)::int - 1) / 7) + 1) as w,
           count(*) as n,
           sum(greatest(coalesce(individual_count, 1), 1))::bigint as birds,
           sum(sqrt(greatest(coalesce(individual_count, 1), 1)::numeric)) as sq_raw
    from public.elurikkus_observations
    where observed_at is not null
      and species_name is not null
    group by 1, 2
  )
  select coalesce(jsonb_object_agg(species_name, h), '{}'::jsonb)
  from (
    select species_name,
           jsonb_agg(jsonb_build_array(w, n, birds, sq) order by w) as h
    from (
      select a.species_name, a.w, a.n, a.birds,
             round(a.sq_raw * mx.m / coalesce(c.ncov, mx.m), 1) as sq
      from agg a
      left join cov c on c.w = a.w
      cross join mx
    ) t
    group by species_name
  ) s;
$function$;

grant execute on function public.get_species_week_histograms() to anon, authenticated;
