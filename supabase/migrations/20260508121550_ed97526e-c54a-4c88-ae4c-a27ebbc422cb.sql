alter table public.elurikkus_cache
  add column if not exists locality      text,
  add column if not exists municipality  text,
  add column if not exists county        text,
  add column if not exists coords_status text,
  add column if not exists coords_source text;

comment on column public.elurikkus_cache.locality      is 'Locality string from mostRecent observation (eElurikkus row)';
comment on column public.elurikkus_cache.coords_status is 'public | restricted | missing — for the coords stored in lat/lon';
comment on column public.elurikkus_cache.coords_source is 'exact | municipality_centroid | county_centroid | none';