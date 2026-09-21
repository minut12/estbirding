-- P51 (applied 2026-09-21, never committed) + P54a: year taken in Europe/Tallinn, not UTC,
-- so the function rolls to the new year at local midnight. Payload unchanged:
-- {species: [arrival|null, first_obs_of_year]}.
create or replace function public.get_species_spring_arrivals()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with y as (select extract(year from (now() at time zone 'Europe/Tallinn'))::int as yr),
  b as (select make_date(yr, 1, 1) as y0, make_date(yr, 2, 15) as c, make_date(yr, 7, 1) as y1 from y),
  days as (
    select o.species_name as sp, o.observed_at as d, count(*) as n
    from public.elurikkus_observations o, b
    where o.observed_at >= b.y0 and o.observed_at < b.y1 and o.species_name is not null
    group by 1, 2
  ),
  fy as (select sp, min(d) as first_obs from days group by 1),
  win as (select sp, sum(n)::numeric * 7 / 45 as wk from days, b where d < b.c group by 1),
  w7 as (
    select sp, d,
      sum(n)   over (partition by sp order by d range between current row and interval '6 days' following) as r7,
      count(*) over (partition by sp order by d range between current row and interval '6 days' following) as d7
    from days, b where d >= b.c
  ),
  arr as (
    select w7.sp,
      min(w7.d) filter (where w7.r7 >= greatest(3, 3 * coalesce(win.wk, 0)) and w7.d7 >= 2) as arrival
    from w7 left join win using (sp)
    group by w7.sp
  )
  select coalesce(jsonb_object_agg(arr.sp, jsonb_build_array(arr.arrival, fy.first_obs)), '{}'::jsonb)
  from arr join fy using (sp);
$function$;

grant execute on function public.get_species_spring_arrivals() to anon, authenticated;
