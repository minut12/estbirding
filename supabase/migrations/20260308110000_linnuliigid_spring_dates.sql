create table if not exists public.linnuliigid_spring_dates (
  species_key text primary key,
  species_name text not null,
  spring_date text not null,
  spring_time text null,
  updated_at timestamptz not null default now(),
  updated_by text null
);

alter table public.linnuliigid_spring_dates enable row level security;

drop policy if exists "linnuliigid_spring_dates_read" on public.linnuliigid_spring_dates;
create policy "linnuliigid_spring_dates_read"
on public.linnuliigid_spring_dates
for select
using (true);

drop policy if exists "linnuliigid_spring_dates_write" on public.linnuliigid_spring_dates;
create policy "linnuliigid_spring_dates_write"
on public.linnuliigid_spring_dates
for all
using (auth.role() in ('anon', 'authenticated'))
with check (auth.role() in ('anon', 'authenticated'));
