-- EstBirding Supabase setup (paste into Supabase SQL Editor)
-- 1) Run this SQL.
-- 2) Set env vars in app: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY.
-- 3) After first login, run:
--    update public.profiles set is_admin=true where id='YOUR_AUTH_UUID';

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

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
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create index if not exists idx_events_start_at on public.events (start_at);
create index if not exists idx_events_published_start_at on public.events (is_published, start_at);

alter table public.profiles enable row level security;
alter table public.events enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "events_select_published" on public.events;
create policy "events_select_published"
on public.events for select
to anon, authenticated
using (is_published = true);

drop policy if exists "events_admin_select_all" on public.events;
create policy "events_admin_select_all"
on public.events for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  )
);

drop policy if exists "events_admin_insert" on public.events;
create policy "events_admin_insert"
on public.events for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  )
);

drop policy if exists "events_admin_update" on public.events;
create policy "events_admin_update"
on public.events for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  )
);

drop policy if exists "events_admin_delete" on public.events;
create policy "events_admin_delete"
on public.events for delete
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  )
);
