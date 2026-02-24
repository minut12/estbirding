-- Generic snapshot store for map screens (Europe, Estonia, future maps)
create table if not exists public.map_snapshots (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  version text not null,
  created_at timestamptz not null default now(),
  payload jsonb not null,
  meta jsonb not null default '{}'::jsonb
);

alter table public.map_snapshots enable row level security;

-- Public read is useful for client-side snapshot restore.
create policy "map_snapshots_read"
on public.map_snapshots
for select
using (true);

-- Client-side upsert support (best-effort backup from browser).
create policy "map_snapshots_insert"
on public.map_snapshots
for insert
with check (true);

create policy "map_snapshots_update"
on public.map_snapshots
for update
using (true)
with check (true);
