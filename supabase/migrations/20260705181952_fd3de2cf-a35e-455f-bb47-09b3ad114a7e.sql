create table if not exists public.ebird_recent_obs (
  id            bigint generated always as identity primary key,
  species_name  text not null,
  obs_date      date,
  lat           double precision,
  lon           double precision,
  sub_id        text,
  location_name text,
  fetched_at    timestamptz not null default now()
);

create unique index if not exists ebird_recent_obs_uniq
  on public.ebird_recent_obs (sub_id, species_name, obs_date);
create index if not exists ebird_recent_obs_date_idx    on public.ebird_recent_obs (obs_date);
create index if not exists ebird_recent_obs_species_idx on public.ebird_recent_obs (species_name);

grant select on public.ebird_recent_obs to anon, authenticated;
grant all on public.ebird_recent_obs to service_role;

alter table public.ebird_recent_obs enable row level security;
create policy ebird_recent_obs_read on public.ebird_recent_obs for select using (true);