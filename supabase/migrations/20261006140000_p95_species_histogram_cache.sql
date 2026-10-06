-- 20261006140000_p95_species_histogram_cache.sql
-- P95: Randeajad histogram RPC timed out for anon (statement_timeout 3s; full scan of
-- elurikkus_observations, ~1.6 s warm, >3 s cold/under load) -> HTTP 500, no strip/card.
-- Fix: precompute both payloads into a one-row cache; public RPCs keep name + shape and
-- read the cache. Refresh daily 02:45 UTC (after m7-elurikkus 02:15).

-- 1. Cache table (no RLS policies: only SECURITY DEFINER functions read/write it)
create table if not exists public.species_histogram_cache (
  id              smallint primary key default 1 check (id = 1),
  week_histograms jsonb not null,
  max_counts      jsonb not null,
  built_at        timestamptz not null default now()
);
alter table public.species_histogram_cache enable row level security;
revoke all on public.species_histogram_cache from anon, authenticated;

-- 2. Compute functions = the current RPC bodies, unchanged
create or replace function public.compute_species_week_histograms()
 returns jsonb
 language sql
 stable
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

create or replace function public.compute_species_max_counts()
 returns jsonb
 language sql
 stable
 set search_path to 'public'
as $function$
  with r as (
    select distinct on (species_name, h) species_name,
           case when least(52, ((extract(doy from observed_at)::int - 1) / 7) + 1) <= 26 then 's' else 'a' end as h,
           individual_count as n, observed_at as d, locality as loc
    from public.elurikkus_observations
    where observed_at is not null and species_name is not null and individual_count >= 10
    order by species_name, h, individual_count desc, observed_at desc
  )
  select coalesce(jsonb_object_agg(species_name, x), '{}'::jsonb)
  from (select species_name, jsonb_object_agg(h, jsonb_build_array(n, d, loc)) as x
        from r group by species_name) t;
$function$;

-- 3. Refresher (cron only)
create or replace function public.refresh_species_histogram_cache()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into public.species_histogram_cache (id, week_histograms, max_counts, built_at)
  values (1, public.compute_species_week_histograms(), public.compute_species_max_counts(), now())
  on conflict (id) do update
    set week_histograms = excluded.week_histograms,
        max_counts      = excluded.max_counts,
        built_at        = excluded.built_at;
end;
$function$;

revoke execute on function public.compute_species_week_histograms() from public, anon, authenticated;
revoke execute on function public.compute_species_max_counts()     from public, anon, authenticated;
revoke execute on function public.refresh_species_histogram_cache() from public, anon, authenticated;

-- 4. Public RPCs: same name, same jsonb shape, read the cache (compute fallback if empty)
create or replace function public.get_species_week_histograms()
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select coalesce(
    (select week_histograms from public.species_histogram_cache where id = 1),
    public.compute_species_week_histograms()
  );
$function$;

create or replace function public.get_species_max_counts()
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select coalesce(
    (select max_counts from public.species_histogram_cache where id = 1),
    public.compute_species_max_counts()
  );
$function$;

-- 5. Seed now
select public.refresh_species_histogram_cache();

-- 6. Daily rebuild 02:45 UTC
select cron.schedule(
  'species-histogram-cache',
  '45 2 * * *',
  $$select public.refresh_species_histogram_cache()$$
);
