-- User-scoped pins for individual GBIF occurrence markers on the USA maps.
-- Each row = one pinned GBIF occurrence (single sighting) on one map for one user.

create table if not exists public.gbif_pins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  map_scope text not null,            -- 'usa_co' | 'usa_pa' | 'usa_i70'
  gbif_id text not null,              -- GBIF occurrence key (stable, globally unique)
  species text not null,              -- species display name as shown on the map
  lat double precision not null,
  lon double precision not null,
  event_date text,                    -- GBIF eventDate (ISO string) or null
  created_at timestamptz not null default now(),
  unique (user_id, map_scope, gbif_id)
);

-- Fast lookup of a user's pins for a given map.
create index if not exists gbif_pins_user_scope_idx
  on public.gbif_pins (user_id, map_scope);

-- Grants: auth-only table (all policies scope to auth.uid()), no anon grant.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gbif_pins TO authenticated;
GRANT ALL ON public.gbif_pins TO service_role;

alter table public.gbif_pins enable row level security;

-- Users can read/insert/update/delete only their own pins.
create policy "Users select own gbif pins"
  on public.gbif_pins for select
  using (auth.uid() = user_id);

create policy "Users insert own gbif pins"
  on public.gbif_pins for insert
  with check (auth.uid() = user_id);

create policy "Users update own gbif pins"
  on public.gbif_pins for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own gbif pins"
  on public.gbif_pins for delete
  using (auth.uid() = user_id);