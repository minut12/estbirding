-- p178d2_ext_rare_geocode_and_species_map.sql
-- P178d2: support objects for ext-rare-refresh (service role only).

-- 1) Nominatim results, cached so each place is looked up once (OSM policy: 1 req/s, own UA).
--    lat/lng null = looked up, no usable match (do not retry until retry_after).
create table if not exists public.ext_place_geocode (
  country_code  text        not null,
  query         text        not null,            -- normalised text sent to Nominatim
  lat           double precision,
  lng           double precision,
  display_name  text,
  osm_type      text,
  osm_id        bigint,
  looked_up_at  timestamptz not null default now(),
  retry_after   timestamptz,                     -- set on a miss; null on a hit
  primary key (country_code, query),
  check ((lat is null) = (lng is null))
);
alter table public.ext_place_geocode enable row level security;
-- No policies: only the service role (Edge Function) reads and writes it.

-- 2) Latin -> Estonian name for species on the Euroopa list only (ruling: Euroopa species only).
--    EOU names (hk_species) win; eBird / P104 pairs are used only for names hk_species lacks,
--    so a wrong eBird pairing (e.g. Raipekotkas = Gyps fulvus) cannot override EOU.
--    Hybrids (" x ") are skipped. Checked 29 Oct 2026: 243 Euroopa names -> 243 Latin names, 1:1.
create or replace function public.ext_rare_species_map()
returns table (species_sci text, species_et text)
language sql
stable
security definer
set search_path = public
as $$
  with eu as (
    select distinct species_name as n from public.europe_ebird_cache
  ),
  hk as (
    select lower(et_name) as et, species_sci as sci, 1 as pri
      from public.hk_species where et_name is not null and not is_subspecies
    union all
    select lower(et_alt_name), species_sci, 2
      from public.hk_species where et_alt_name is not null and not is_subspecies
  ),
  other as (
    select lower(species_et_name) as et, species_lat_name as sci, 3 as pri
      from public.ebird_rare_observations
      where species_et_name is not null and species_lat_name is not null
    union all
    select lower(name_et), sci_name, 4
      from public.europe_new_species where name_et is not null
  ),
  pairs as (
    select * from hk
    union all
    select o.* from other o where not exists (select 1 from hk where hk.et = o.et)
  )
  select distinct on (lower(p.sci)) p.sci, eu.n
  from eu
  join pairs p on p.et = lower(eu.n)
  where p.sci !~ ' x '
  order by lower(p.sci), p.pri;
$$;

revoke all on function public.ext_rare_species_map() from public, anon, authenticated;
