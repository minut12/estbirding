create table if not exists public.gbif_occurrences (
  id           bigint generated always as identity primary key,
  species_name text not null,
  species_lat  text,
  gbif_key     bigint unique,
  observed_at  date,
  lat          double precision not null,
  lon          double precision not null,
  fetched_at   timestamptz not null default now()
);
create index if not exists gbif_occ_species_idx      on public.gbif_occurrences (species_name);
create index if not exists gbif_occ_species_date_idx on public.gbif_occurrences (species_name, observed_at);

create table if not exists public.gbif_taxon_keys (
  species_name     text primary key,
  species_lat      text,
  taxon_key        bigint,
  match_confidence text,
  override         boolean not null default false,
  matched_at       timestamptz not null default now()
);

grant select on public.gbif_occurrences to anon, authenticated;
grant all    on public.gbif_occurrences to service_role;
grant select on public.gbif_taxon_keys  to anon, authenticated;
grant all    on public.gbif_taxon_keys  to service_role;

alter table public.gbif_occurrences enable row level security;
alter table public.gbif_taxon_keys  enable row level security;

create policy gbif_occ_read  on public.gbif_occurrences for select using (true);
create policy gbif_keys_read on public.gbif_taxon_keys  for select using (true);