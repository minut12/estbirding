-- p184f_rarity_stay_days_no_flybys.sql
-- P184f: stay length ignores flybys (Elurikkus behaviour r, rN, rS, rE, rW, rNE, rNW, rSE, rSW and ü).
-- 'rp' (stopover) and other codes are kept. Adds n_multi_day and n_over_3d (counts, no percent);
-- old columns are kept so the currently deployed toenaosus-orchestrator keeps working.
drop function if exists public.rarity_stay_days(text[]);

create function public.rarity_stay_days(p_species text[])
 returns table(species_et text, n_birds integer, median_days integer, pct_over_3d integer, max_days integer, n_multi_day integer, n_over_3d integer)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  -- One "bird" = same species, same ~25 km cell (0.25 deg lat x 0.5 deg lon),
  -- consecutive records no more than 3 days apart. Flyby records are ignored.
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
      and (e.behavior is null
           or (e.behavior !~ '^r(N|S|E|W|NE|NW|SE|SW)?$' and e.behavior <> 'ü'))
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
         max(days)::int,
         (count(*) filter (where days >= 2))::int,
         (count(*) filter (where days > 3))::int
  from birds
  group by sp;
$function$;

revoke all on function public.rarity_stay_days(text[]) from public;
grant execute on function public.rarity_stay_days(text[]) to anon, authenticated, service_role;
