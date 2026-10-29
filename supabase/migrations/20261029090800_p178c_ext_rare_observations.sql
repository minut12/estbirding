-- p178c_ext_rare_observations.sql
-- P178c: non-eBird rarity records (LOFK birdlife.lt, Tarsiger; later Tiira, Artportalen).
-- Written by ext-rare-refresh (service role). Read by the app via the RPC only
-- (PostgREST caps plain selects at 25 rows). No observer column, by ruling.

create table if not exists public.ext_rare_observations (
  source           text        not null check (source in ('lofk','tarsiger','tiira','artportalen')),
  source_id        text        not null,
  country_code     text        not null,
  species_sci      text        not null,
  species_et       text,
  obs_date_from    date        not null,
  obs_date_to      date        not null,
  place_text       text        not null default '',
  district_hint    text,
  lat              double precision,
  lng              double precision,
  coord_precision  text        not null default 'country'
                   check (coord_precision in ('exact','municipality','country')),
  note_text        text,
  nth_record       integer,
  is_important     boolean     not null default false,
  photo_url        text,
  source_url       text        not null,
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  primary key (source, source_id),
  check ((lat is null) = (lng is null))
);

create index if not exists ext_rare_observations_date_idx
  on public.ext_rare_observations (obs_date_to desc);
create index if not exists ext_rare_observations_species_idx
  on public.ext_rare_observations (species_sci);

alter table public.ext_rare_observations enable row level security;
-- No anon/authenticated policies: the table is read only through the RPC below.

create or replace function public.get_ext_rare_observations(p_days integer default 30)
returns setof public.ext_rare_observations
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.ext_rare_observations
  where obs_date_to >= ((now() at time zone 'Europe/Tallinn')::date - greatest(1, least(p_days, 365)))
  order by obs_date_to desc, source, source_id;
$$;

revoke all on function public.get_ext_rare_observations(integer) from public;
grant execute on function public.get_ext_rare_observations(integer) to anon, authenticated;
