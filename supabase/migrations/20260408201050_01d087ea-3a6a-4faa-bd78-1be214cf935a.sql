create table if not exists public.elurikkus_cache (
  species_name   text primary key,
  lat            double precision,
  lon            double precision,
  occ7           integer default 0,
  t              text,
  coords_status  text,
  coords_source  text,
  open_url       text,
  search_url     text,
  fetched_at     timestamptz not null default now()
);

alter table public.elurikkus_cache enable row level security;

create policy "Public read elurikkus_cache"
  on public.elurikkus_cache for select
  using (true);

create policy "Service role upsert elurikkus_cache"
  on public.elurikkus_cache for all
  using (auth.role() = 'service_role');