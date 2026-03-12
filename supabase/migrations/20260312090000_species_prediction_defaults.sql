create table if not exists public.species_prediction_defaults (
  id uuid primary key default gen_random_uuid(),
  map_scope text not null,
  species_key text not null,
  species_name text not null default '',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (map_scope, species_key)
);

alter table public.species_prediction_defaults enable row level security;

drop policy if exists "species_prediction_defaults_read" on public.species_prediction_defaults;
create policy "species_prediction_defaults_read"
on public.species_prediction_defaults
for select
to authenticated
using (true);

drop policy if exists "species_prediction_defaults_insert" on public.species_prediction_defaults;
create policy "species_prediction_defaults_insert"
on public.species_prediction_defaults
for insert
to authenticated
with check (public.has_permission('settings.manage', auth.uid()));

drop policy if exists "species_prediction_defaults_update" on public.species_prediction_defaults;
create policy "species_prediction_defaults_update"
on public.species_prediction_defaults
for update
to authenticated
using (public.has_permission('settings.manage', auth.uid()))
with check (public.has_permission('settings.manage', auth.uid()));

drop policy if exists "species_prediction_defaults_delete" on public.species_prediction_defaults;
create policy "species_prediction_defaults_delete"
on public.species_prediction_defaults
for delete
to authenticated
using (public.has_permission('settings.manage', auth.uid()));

drop trigger if exists species_prediction_defaults_updated_at on public.species_prediction_defaults;
create trigger species_prediction_defaults_updated_at
before update on public.species_prediction_defaults
for each row execute function public.update_updated_at_column();
