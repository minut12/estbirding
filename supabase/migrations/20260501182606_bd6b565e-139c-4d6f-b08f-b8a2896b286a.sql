create table if not exists public.vaatluste_raport (
  id uuid primary key default gen_random_uuid(),
  generated_at timestamptz not null default now(),
  period_start date not null,
  period_end date not null,
  intro_et text,
  estonia_narrative_et text,
  estonia_entries jsonb not null default '[]'::jsonb,
  europe_narrative_et text,
  europe_entries jsonb not null default '[]'::jsonb,
  source_data jsonb,
  model text default 'claude-sonnet-4-5',
  generation_meta jsonb
);

create index if not exists vaatluste_raport_generated_at_idx
  on public.vaatluste_raport (generated_at desc);

alter table public.vaatluste_raport enable row level security;

create policy "vaatluste_raport read for all"
  on public.vaatluste_raport for select
  using (true);

create policy "vaatluste_raport insert for service role"
  on public.vaatluste_raport for insert
  with check (auth.role() = 'service_role');