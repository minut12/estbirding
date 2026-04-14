create table if not exists public.ennustus_cache (
  id bigserial primary key,
  species_name text not null,
  computed_at bigint not null,
  score int not null default 0,
  current_pct int,
  cell_lat double precision,
  cell_lon double precision,
  season text,
  no_data boolean default false,
  exit_reason text,
  updated_at timestamptz default now()
);

create unique index if not exists ennustus_cache_species_uniq
  on public.ennustus_cache (species_name);

create index if not exists ennustus_cache_updated_idx
  on public.ennustus_cache (updated_at desc);

alter table public.ennustus_cache enable row level security;

create policy "ennustus_cache read for all"
  on public.ennustus_cache
  for select
  using (true);

create policy "ennustus_cache write for authenticated"
  on public.ennustus_cache
  for all
  to authenticated
  using (true)
  with check (true);