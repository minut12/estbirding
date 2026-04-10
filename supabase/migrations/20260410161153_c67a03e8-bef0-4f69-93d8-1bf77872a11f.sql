create table if not exists public.ebird_cache (
  species_name   text primary key,
  lat            double precision,
  lon            double precision,
  occ7           integer default 0,
  t              text,
  location_name  text,
  sub_id         text,
  fetched_at     timestamptz not null default now()
);

alter table public.ebird_cache enable row level security;

create policy "Public read ebird_cache"
  on public.ebird_cache for select
  using (true);

create policy "Service role upsert ebird_cache"
  on public.ebird_cache for all
  using (auth.role() = 'service_role');