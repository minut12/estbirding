-- Vaatluste raport table.
-- Populated twice daily by the n8n `vaatluste-koordinaator` workflow.
-- Read by the React frontend Ülevaade page.
-- Spec: docs/vaatluste-koordinaator.md

create extension if not exists pgcrypto;

create table if not exists public.vaatluste_raport (
  id                    uuid primary key default gen_random_uuid(),
  generated_at          timestamptz not null default now(),
  period_start          date not null,
  period_end            date not null,
  intro_et              text,
  estonia_narrative_et  text,
  estonia_entries       jsonb not null default '[]'::jsonb,
  europe_narrative_et   text,
  europe_entries        jsonb not null default '[]'::jsonb,
  source_data           jsonb,                       -- raw eBird payload, for debugging
  model                 text default 'claude-sonnet-4-6',
  generation_meta       jsonb                        -- token usage, stop_reason, latency
);

create index if not exists vaatluste_raport_generated_at_idx
  on public.vaatluste_raport (generated_at desc);

alter table public.vaatluste_raport enable row level security;

-- Public read for the Ülevaade page (anon + authenticated)
drop policy if exists "vaatluste_raport read for all" on public.vaatluste_raport;
create policy "vaatluste_raport read for all"
  on public.vaatluste_raport for select
  using (true);

-- Service role inserts only (n8n authenticates with the service role key)
drop policy if exists "vaatluste_raport insert for service role" on public.vaatluste_raport;
create policy "vaatluste_raport insert for service role"
  on public.vaatluste_raport for insert
  with check (auth.role() = 'service_role');
