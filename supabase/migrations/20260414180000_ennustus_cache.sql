create table if not exists public.ennustus_cache (
  species_name   text primary key,
  computed_at    bigint not null,
  score          integer not null default 0,
  current_pct    integer,
  cell_lat       double precision,
  cell_lon       double precision,
  season         text,
  no_data        boolean default false,
  exit_reason    text,
  updated_at     timestamptz not null default now()
);

create index if not exists ennustus_cache_updated_idx
  on public.ennustus_cache (updated_at desc);

alter table public.ennustus_cache enable row level security;

create policy "Public read ennustus_cache"
  on public.ennustus_cache for select
  using (true);

create policy "Public write ennustus_cache"
  on public.ennustus_cache for all
  using (true);
