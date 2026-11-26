-- P189a_prob_grid_effort.sql
-- P189 Tõenäosuse kaart: observation-day effort per grid cell and 2-week period.
-- Feeds compute-ennustus (new rate layer). Leaves ennustus_cell_effort (P184) untouched.
-- Apply only after Kristian's go. Then commit this file byte-identical under supabase/migrations/.

-- 1. Effort: distinct observation days (any species) per cell and 2-week period, all years since 2010.
--    Period k = (day_of_year - 1) / 14, capped at 25 (matches getYearPeriods in index.html / compute-ennustus).
--    Cell index gi = floor(lat / size), gj = floor(lon / size); the EF must compute the same indices.
create materialized view if not exists public.prob_grid_effort as
select s.sz::numeric(3,2)                                                  as cell_size,
       floor(o.lat / s.sz)::int                                            as gi,
       floor(o.lon / s.sz)::int                                            as gj,
       least(25, (extract(doy from o.observed_at)::int - 1) / 14)::smallint as period,
       count(distinct o.observed_at)::int                                  as days_any
from public.elurikkus_observations o
cross join (values (0.10::float8), (0.15::float8), (0.20::float8)) as s(sz)
where o.lat between 57.3 and 59.9
  and o.lon between 21.3 and 28.5
  and o.observed_at >= date '2010-01-01'
group by 1, 2, 3, 4;

create unique index if not exists prob_grid_effort_pk
  on public.prob_grid_effort (cell_size, gi, gj, period);

-- Server-side only (compute-ennustus uses the service role).
revoke all on public.prob_grid_effort from anon, authenticated;
grant select on public.prob_grid_effort to service_role;

-- 2. Per-species metadata for the new layer (season, month bars, rate layers). Nullable; old fields unchanged.
alter table public.ennustus_cells_cache add column if not exists meta jsonb;

-- 3. Daily refresh at 03:20 UTC, before m7-ennustus (04:00 UTC). Takes about 6 s.
select cron.schedule(
  'prob-grid-effort-refresh',
  '20 3 * * *',
  $$refresh materialized view concurrently public.prob_grid_effort$$
);
