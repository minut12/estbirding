-- EstBirding admin events (Option 1)
-- Run in Supabase SQL Editor.

-- A) EXTENSIONS
create extension if not exists "pgcrypto";

-- B) TABLE
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  start_at timestamptz not null,
  end_at timestamptz,
  location_name text,
  lat double precision,
  lng double precision,
  category text not null default 'EstBirding',
  organizer_name text,
  url text,
  image_url text,
  is_published boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- C) UPDATED_AT TRIGGER
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

-- D) INDEXES
create index if not exists idx_events_start_at on public.events (start_at);
create index if not exists idx_events_published_start on public.events (is_published, start_at);

-- E) ADMIN FLAG
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Replace with your user UUID:
-- update public.profiles set is_admin = true where id = 'YOUR_USER_UUID';

-- F) RLS
alter table public.events enable row level security;
alter table public.profiles enable row level security;

-- G) POLICIES
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile"
on public.profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists "admin update profiles" on public.profiles;
create policy "admin update profiles"
on public.profiles for update
to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

drop policy if exists "create own profile" on public.profiles;
create policy "create own profile"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "read published events" on public.events;
create policy "read published events"
on public.events for select
to anon, authenticated
using (is_published = true);

drop policy if exists "admin read all events" on public.events;
create policy "admin read all events"
on public.events for select
to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

drop policy if exists "admin insert events" on public.events;
create policy "admin insert events"
on public.events for insert
to authenticated
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

drop policy if exists "admin update events" on public.events;
create policy "admin update events"
on public.events for update
to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

drop policy if exists "admin delete events" on public.events;
create policy "admin delete events"
on public.events for delete
to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));
