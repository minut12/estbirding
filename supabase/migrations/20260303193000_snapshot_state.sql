create table if not exists public.snapshot_state (
  key text primary key,
  building boolean not null default false,
  last_build_started_at timestamptz null,
  last_build_finished_at timestamptz null,
  last_snapshot_id text null,
  last_data_max_at timestamptz null
);

alter table public.snapshot_state enable row level security;

drop policy if exists "snapshot_state_read" on public.snapshot_state;
create policy "snapshot_state_read"
on public.snapshot_state
for select
using (true);

drop policy if exists "snapshot_state_service_write" on public.snapshot_state;
create policy "snapshot_state_service_write"
on public.snapshot_state
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
