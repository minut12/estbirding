-- Minimal Events setup for public read + admin actions via Edge Function.
-- Setup:
-- 1) Run this SQL in Supabase SQL Editor.
-- 2) Add secret EVENTS_ADMIN_KEY in Supabase dashboard.
-- 3) Deploy edge function "events-admin".
-- 4) In app Developer Settings, paste EVENTS_ADMIN_KEY and save.

create extension if not exists "pgcrypto";

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

alter table public.events enable row level security;

drop policy if exists "events_public_read_published" on public.events;
create policy "events_public_read_published"
on public.events for select
to anon, authenticated
using (is_published = true);
