-- P46d-randeajad-rpc-birds.sql
-- Migration name: p46d_species_week_histograms_birds
-- NOT APPLIED. Apply only after Kristian's explicit go.
--
-- Extends get_species_week_histograms(): rows go from [week, records]
-- to [week, records, birds, sqrtBirds]. Backward compatible: the client live in production
-- reads only row[0] and row[1].
--   birds     = sum of individual_count per week
--   sqrtBirds = sum of sqrt(individual_count) per record, rounded to 0.1 (damped weight for the window rule)
-- individual_count <= 0 or NULL ("present, not counted": -1 x 9 988, 0 x 1 664, NULL x 12 on 2026-09-20) counts as 1.
-- Expected size: ~398 species, ~10 500 rows, roughly 220-260 KB (was 110 KB).

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
           jsonb_agg(jsonb_build_array(w, n, birds, sq) order by w) as h
    from (
      select species_name,
             least(52, ((extract(doy from observed_at)::int - 1) / 7) + 1) as w,
             count(*) as n,
             sum(greatest(coalesce(individual_count, 1), 1))::bigint as birds,
             round(sum(sqrt(greatest(coalesce(individual_count, 1), 1)::numeric)), 1) as sq
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
--   select jsonb_typeof(r) t, (select count(*) from jsonb_object_keys(r)) species, length(r::text) bytes,
--          r->'Sookurg'->12 sookurg_wk13 from public.get_species_week_histograms() r;
--   -- expect sookurg_wk13 like [13, 935, 7750, 1875.3] (values grow with new data)
--
-- Rollback = re-apply P46a (supabase/migrations/20260919180000_p46a_get_species_week_histograms.sql).
