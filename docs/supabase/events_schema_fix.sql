-- Run this in Supabase SQL Editor once. It is safe to re-run.

-- 0) Ensure uuid generator exists (safe)
create extension if not exists "pgcrypto";

-- 1) Ensure required columns exist (safe)
alter table public.events
  add column if not exists is_published boolean not null default false,
  add column if not exists is_archived boolean not null default false;

-- 2) updated_at trigger (safe)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists trg_events_updated_at on public.events;
create trigger trg_events_updated_at
before update on public.events
for each row execute function public.set_updated_at();

-- 3) Index (safe)
create index if not exists idx_events_pub_arch_start
on public.events (is_published, is_archived, start_at);

-- 4) RLS: allow public read ONLY published & not archived
alter table public.events enable row level security;

drop policy if exists "events_read_published" on public.events;
create policy "events_read_published"
on public.events for select
to anon, authenticated
using (is_published = true and is_archived = false);

-- 5) Optional: quick verification query (leave commented)
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema='public' and table_name='events'
-- order by ordinal_position;
