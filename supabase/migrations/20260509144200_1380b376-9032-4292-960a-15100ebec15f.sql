create table if not exists public.toenaosus_raport (
  id              uuid        primary key default gen_random_uuid(),
  generated_at    timestamptz not null    default now(),
  period_start    date        not null,
  period_end      date        not null,
  season          text        not null
                  check (season in ('spring_summer', 'fall_winter')),
  regions         text[]      not null    default '{}',
  intro_et        text,
  entries         jsonb       not null    default '[]'::jsonb,
  source_data     jsonb,
  model           text        default 'claude-sonnet-4-6',
  generation_meta jsonb
);

comment on table  public.toenaosus_raport is
  'Twice-daily report of rare/super/mega species observed in neighboring countries with computed Estonian-arrival probability. Written by n8n via insert-toenaosus-raport.';
comment on column public.toenaosus_raport.season  is
  'spring_summer (Mar 1 – Jul 31) or fall_winter (Aug 1 – Feb 28/29)';
comment on column public.toenaosus_raport.regions is
  'eBird region codes queried for this run, e.g. {LV,LT,BY,PL,RU-KGD}';
comment on column public.toenaosus_raport.entries is
  'JSONB array of ToenaosusEntry — VaatlusEntry shape extended with distance_to_ee_km, total_neighbor_obs_30d, neighbor_breakdown, why_likely_et, probability_factors';

create index if not exists toenaosus_raport_generated_at_idx
  on public.toenaosus_raport (generated_at desc);

alter table public.toenaosus_raport enable row level security;

drop policy if exists "toenaosus_raport_public_select" on public.toenaosus_raport;

create policy "toenaosus_raport_public_select"
  on public.toenaosus_raport
  for select
  using (true);