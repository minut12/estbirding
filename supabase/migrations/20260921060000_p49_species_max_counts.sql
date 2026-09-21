-- P49-species-max-counts.sql
-- Migration name: p49_species_max_counts
-- APPLIED to prod rfjhrosxbaihyrnbmmbl on 2026-09-21 via the Supabase connector,
-- on Kristian's explicit go. This file is the repo record of what is already live.
-- Do NOT re-run it.
--
-- Largest single record per species per half for the Randeajad card line
-- "enim isendeid N . date . locality". Halves use the same week formula as
-- get_species_week_histograms: weeks 1-26 = 's' (kevad), 27-52 = 'a' (sugis).
-- Only records with individual_count >= 10. Ties: most recent date wins.
-- Largest single record, not a same-day sum: summing double-counts one flock
-- reported by several observers.
-- Payload: { "<species>": { "s": [count, "YYYY-MM-DD", locality|null], "a": [...] } }
-- Measured 2026-09-21: 201 species, 361 halves, 17.8 kB, ~2.35 s.
-- Locality is stored as Elurikkus publishes it; sensitive species are already
-- generalised to municipality at source.

create or replace function public.get_species_max_counts()
returns jsonb
language sql
stable
security definer
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

grant execute on function public.get_species_max_counts() to anon, authenticated;
