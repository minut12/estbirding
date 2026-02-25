alter table public.events
add column if not exists is_archived boolean not null default false;

create index if not exists idx_events_archived on public.events (is_archived);
