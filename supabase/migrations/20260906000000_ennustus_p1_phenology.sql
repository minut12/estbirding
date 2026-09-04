-- supabase/migrations/20260906000000_ennustus_p1_phenology.sql
-- Ennustus rework P1. Idempotent.
-- Applied live 2026-09-04 via MCP as ennustus_p1_phenology + _v2; this file is the consolidated equivalent.
--
-- Three additive changes, no data:
--   1. species_phenology       — curated per-species migration profile (seeded in P2)
--   2. gbif_occurrences.country_code — widen the history backbone beyond EE (P3 writes it)
--   3. rarity_lag_pairs / rarity_lag_stats — foreign->EE arrival lag, for score v4 `upstream`

-- ---------------------------------------------------------------------------
-- 0. Drop dependants first so re-running this file is safe.
--    `create or replace function` cannot change a RETURNS TABLE signature, and
--    the view pins the function, so both must go before the creates below.
--    The one-arg drop clears the pre-review signature, should it ever have run.
-- ---------------------------------------------------------------------------
drop view     if exists public.rarity_lag_stats;
drop function if exists public.rarity_lag_pairs(int);
drop function if exists public.rarity_lag_pairs(int, text);

-- ---------------------------------------------------------------------------
-- 1. species_phenology — curated per-species migration profile (seeded in P2)
-- ---------------------------------------------------------------------------
create table if not exists public.species_phenology (
  scientific_name        text primary key,
  ebird_code             text,
  arrival_modes          text[] not null default '{}',
  spring_window          daterange,
  autumn_window          daterange,
  arrival_bearing_spring smallint check (arrival_bearing_spring between 0 and 359),
  arrival_bearing_autumn smallint check (arrival_bearing_autumn between 0 and 359),
  source_regions_spring  text[] not null default '{}',
  source_regions_autumn  text[] not null default '{}',
  flight_class           text not null default 'passerine_nocturnal'
                         check (flight_class in ('passerine_nocturnal','raptor_soaring','wader','waterbird','seabird','heron_stork')),
  cruise_kmh             smallint,
  refs                   jsonb not null default '{}'::jsonb,
  curated_by             text,
  updated_at             timestamptz not null default now()
);

alter table public.species_phenology drop constraint if exists species_phenology_modes_chk;
alter table public.species_phenology add constraint species_phenology_modes_chk
  check (arrival_modes <@ array['spring_overshoot','autumn_drift','post_breeding_dispersal','winter_irruption','reverse_migration']::text[]);

comment on table public.species_phenology is
  'Ennustus v4: curated per-species arrival phenology. Windows stored in year 2000 (month/day only).';

-- Anon-readable BY DESIGN: curated reference data with no PII, read directly by the
-- linnuliigid iframe in a later phase. Deliberate opposite of public.corridor_species_tags,
-- which is service_role-only (RLS on, no policy) and reachable solely via the
-- get-corridor-tags Edge Function.
grant select on public.species_phenology to anon, authenticated;
grant all    on public.species_phenology to service_role;
alter table public.species_phenology enable row level security;
drop policy if exists species_phenology_public_select on public.species_phenology;
create policy species_phenology_public_select on public.species_phenology for select using (true);
-- 20260830000000_default_privileges_public grants ALL to anon/authenticated on new tables; RLS already blocks writes, but the grant should not exist.
revoke insert, update, delete, truncate, references, trigger on public.species_phenology from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. gbif_occurrences.country_code — widen history beyond EE (P3 writes FI/SE/LV/LT/RU)
--
--    The 'EE' default backfills the existing ~558 k rows as metadata only (PG 11+
--    non-volatile default: no table rewrite). gbif-bulk-refresh never names this
--    column and upserts on gbif_key, so the writer is untouched.
--    The index builds take a brief ACCESS EXCLUSIVE lock; the table has no
--    interactive readers, so plain (non-CONCURRENTLY) builds are fine here and
--    keep this file runnable inside the SQL editor's transaction.
-- ---------------------------------------------------------------------------
alter table public.gbif_occurrences add column if not exists country_code text not null default 'EE';

create index if not exists gbif_occ_species_country_date_idx
  on public.gbif_occurrences (species_name, country_code, observed_at);

-- Partial index for the lateral probe in rarity_lag_pairs: foreign rows only, newest first.
-- Without it the probe index-scans the species prefix and filters country_code afterwards → O(n²) per species (>60 s full scan before P3 even lands).
create index if not exists gbif_occ_foreign_species_date_idx
  on public.gbif_occurrences (species_name, observed_at desc, id desc)
  where country_code <> 'EE';

-- ---------------------------------------------------------------------------
-- 3. rarity_lag_pairs — for each EE record, the nearest prior foreign record
--    of the same species within p_max_lag_days.
--
--    Joins on species_name (not species_lat): P3's writer copies species_name
--    from gbif_taxon_keys, so it is the stable key; species_lat is nullable there.
--    `<=` on the date admits a same-day foreign record — lag_days = 0 is a
--    meaningful precedent, not a bug.
--
--    plpgsql with two `return query` branches, NOT one query with
--    `(p_species_name is null or ee.species_name = p_species_name)`: that form is
--    planned as a seq scan (measured 165 k buffers for a 0-row species; 0.003 s
--    after the split). The branches are otherwise identical.
--
--    SECURITY DEFINER + explicit search_path, matching
--    public.bulk_upsert_ebird_rare_observations. The revoke below is REQUIRED,
--    not decorative: see 20260830000000_default_privileges_public.sql — PostgreSQL
--    re-grants PUBLIC EXECUTE on every new function regardless of default ACLs.
-- ---------------------------------------------------------------------------
create or replace function public.rarity_lag_pairs(
  p_max_lag_days int  default 30,
  p_species_name text default null
)
returns table (
  species_name text, species_lat text, ee_date date, ee_lat double precision, ee_lon double precision,
  from_country text, from_date date, from_lat double precision, from_lon double precision,
  lag_days int, bearing_deg int, distance_km int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_species_name is null then
    return query
    select ee.species_name, ee.species_lat, ee.observed_at, ee.lat, ee.lon,
           f.country_code, f.observed_at, f.lat, f.lon,
           (ee.observed_at - f.observed_at)::int,
           (degrees(atan2(sin(radians(ee.lon - f.lon)) * cos(radians(ee.lat)),
                          cos(radians(f.lat)) * sin(radians(ee.lat))
                        - sin(radians(f.lat)) * cos(radians(ee.lat)) * cos(radians(ee.lon - f.lon))))::int + 360) % 360,
           (6371 * acos(least(1.0, greatest(-1.0,
              sin(radians(f.lat)) * sin(radians(ee.lat))
            + cos(radians(f.lat)) * cos(radians(ee.lat)) * cos(radians(ee.lon - f.lon))))))::int
    from public.gbif_occurrences ee
    join lateral (
      select g.* from public.gbif_occurrences g
      where g.species_name = ee.species_name
        and g.country_code <> 'EE'
        and g.observed_at <= ee.observed_at
        and g.observed_at >= ee.observed_at - p_max_lag_days
      order by g.observed_at desc, g.id desc
      limit 1
    ) f on true
    where ee.country_code = 'EE' and ee.observed_at is not null;
  else
    return query
    select ee.species_name, ee.species_lat, ee.observed_at, ee.lat, ee.lon,
           f.country_code, f.observed_at, f.lat, f.lon,
           (ee.observed_at - f.observed_at)::int,
           (degrees(atan2(sin(radians(ee.lon - f.lon)) * cos(radians(ee.lat)),
                          cos(radians(f.lat)) * sin(radians(ee.lat))
                        - sin(radians(f.lat)) * cos(radians(ee.lat)) * cos(radians(ee.lon - f.lon))))::int + 360) % 360,
           (6371 * acos(least(1.0, greatest(-1.0,
              sin(radians(f.lat)) * sin(radians(ee.lat))
            + cos(radians(f.lat)) * cos(radians(ee.lat)) * cos(radians(ee.lon - f.lon))))))::int
    from public.gbif_occurrences ee
    join lateral (
      select g.* from public.gbif_occurrences g
      where g.species_name = ee.species_name
        and g.country_code <> 'EE'
        and g.observed_at <= ee.observed_at
        and g.observed_at >= ee.observed_at - p_max_lag_days
      order by g.observed_at desc, g.id desc
      limit 1
    ) f on true
    where ee.country_code = 'EE' and ee.observed_at is not null
      and ee.species_name = p_species_name;
  end if;
end
$$;

comment on function public.rarity_lag_pairs(int, text) is
  'Ennustus v4: nearest prior foreign occurrence per EE occurrence. Pass p_species_name to push the filter down; null scans the whole EE history.';

revoke all     on function public.rarity_lag_pairs(int, text) from public;
grant  execute on function public.rarity_lag_pairs(int, text) to service_role, authenticated;

-- ---------------------------------------------------------------------------
-- 4. per-species aggregate used by score v4 `upstream`
--
--    Full scan — service-role callers only; consider materializing after P3 if > 5 s.
--    No pushdown survives the aggregate, so every select re-scans the whole EE
--    history. The anon role carries statement_timeout = 3 s and is deliberately
--    not granted here; the orchestrator EF runs as service_role.
--
--    security_invoker = true so the view is not a privilege boundary: the caller
--    needs EXECUTE on rarity_lag_pairs in their own right.
-- ---------------------------------------------------------------------------
create view public.rarity_lag_stats with (security_invoker = true) as
  select species_name, species_lat, from_country,
         count(*)::int as n_pairs,
         (percentile_cont(0.5) within group (order by lag_days))::int    as median_lag_days,
         (percentile_cont(0.5) within group (order by bearing_deg))::int as median_bearing_deg
  from public.rarity_lag_pairs(30, null::text)
  group by species_name, species_lat, from_country;

comment on view public.rarity_lag_stats is
  'Ennustus v4: median foreign->EE lag and bearing per species/source country. Full scan; service_role only.';

-- 20260830000000_default_privileges_public.sql grants ALL on new tables/views to
-- anon and authenticated by default, so restricting this one takes an explicit revoke.
revoke all    on public.rarity_lag_stats from anon, authenticated;
grant  select on public.rarity_lag_stats to service_role;
