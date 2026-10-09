-- P105b: GPS-tracked birds (Movebank) for the Euroopa map.
-- Writes: movebank-refresh Edge Function (service role). Reads: anon via get_gps_tracked_birds() only.

create table if not exists public.movebank_studies (
  study_id        bigint primary key,
  name            text not null,
  license_type    text,
  citation        text,
  pi_name         text,
  last_fix_at     timestamptz,
  status          text not null default 'candidate'
                  check (status in ('candidate','public','licence_required','no_access','empty','not_birds','error')),
  last_checked_at timestamptz,
  last_error      text,
  updated_at      timestamptz not null default now()
);

create table if not exists public.movebank_taxa (
  taxon_latin  text primary key,
  is_bird      boolean not null,
  name_et      text,
  sensitive    boolean not null default false,
  checked_at   timestamptz not null default now()
);

create table if not exists public.gps_tracked_birds (
  study_id                    bigint not null references public.movebank_studies(study_id) on delete cascade,
  individual_local_identifier text   not null,
  taxon_latin                 text   not null,
  lat                         double precision not null,
  lon                         double precision not null,
  coords_rounded              boolean not null default false,
  fix_at                      timestamptz not null,
  fetched_at                  timestamptz not null default now(),
  primary key (study_id, individual_local_identifier)
);
create index if not exists gps_tracked_birds_fix_at_idx on public.gps_tracked_birds (fix_at desc);

alter table public.movebank_studies  enable row level security;
alter table public.movebank_taxa     enable row level security;
alter table public.gps_tracked_birds enable row level security;

create or replace function public.get_gps_tracked_birds()
returns table (
  study_id bigint,
  individual_local_identifier text,
  taxon_latin text,
  name_et text,
  lat double precision,
  lon double precision,
  coords_rounded boolean,
  fix_at timestamptz,
  study_name text,
  license_type text,
  citation text
)
language sql
stable
security definer
set search_path = public
as $$
  select b.study_id, b.individual_local_identifier, b.taxon_latin, t.name_et,
         b.lat, b.lon, b.coords_rounded, b.fix_at,
         s.name, s.license_type, s.citation
  from public.gps_tracked_birds b
  join public.movebank_studies s on s.study_id = b.study_id and s.status = 'public'
  join public.movebank_taxa    t on t.taxon_latin = b.taxon_latin and t.is_bird
  where b.fix_at >= now() - interval '7 days'
    and b.lat between 34 and 72
    and b.lon between -25 and 45
  order by b.fix_at desc
  limit 3000;
$$;

revoke all on function public.get_gps_tracked_birds() from public;
grant execute on function public.get_gps_tracked_birds() to anon, authenticated;
