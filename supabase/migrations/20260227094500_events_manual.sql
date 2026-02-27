create table if not exists public.events_manual (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz null,
  type text not null default 'estbirding',
  location_name text null,
  lat double precision null,
  lon double precision null,
  url text null,
  description text null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  deleted_at timestamptz null,
  constraint events_manual_type_check check (type in ('estbirding', 'muud')),
  constraint events_manual_status_check check (status in ('active', 'archived', 'deleted'))
);

create index if not exists idx_events_manual_status_starts_at on public.events_manual (status, starts_at);
create index if not exists idx_events_manual_type_starts_at on public.events_manual (type, starts_at);

alter table public.events_manual enable row level security;

drop policy if exists "public read manual events not deleted" on public.events_manual;
create policy "public read manual events not deleted"
on public.events_manual
for select
using (status <> 'deleted');

-- Explicitly keep anon read-only (no insert/update/delete policy for anon)
