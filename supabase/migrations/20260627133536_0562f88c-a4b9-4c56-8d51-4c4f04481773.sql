create table if not exists public.poi_pins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  map_scope text not null,
  poi_id text not null,
  lat double precision not null,
  lon double precision not null,
  cat text not null default 'other',
  name text not null default '',
  notes text not null default '',
  url text not null default '',
  created_ms bigint,
  created_at timestamptz not null default now(),
  unique (user_id, map_scope, poi_id)
);

create index if not exists poi_pins_user_scope_idx
  on public.poi_pins (user_id, map_scope);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.poi_pins TO authenticated;
GRANT ALL ON public.poi_pins TO service_role;

alter table public.poi_pins enable row level security;

create policy "Users select own poi pins"
  on public.poi_pins for select
  using (auth.uid() = user_id);

create policy "Users insert own poi pins"
  on public.poi_pins for insert
  with check (auth.uid() = user_id);

create policy "Users update own poi pins"
  on public.poi_pins for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own poi pins"
  on public.poi_pins for delete
  using (auth.uid() = user_id);