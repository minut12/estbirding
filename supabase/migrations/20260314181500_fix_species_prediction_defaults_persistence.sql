create table if not exists public.species_prediction_defaults (
  id uuid primary key default gen_random_uuid(),
  map_scope text not null,
  species_key text not null,
  species_name text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text null
);

alter table public.species_prediction_defaults
  alter column species_name drop not null,
  alter column species_name drop default,
  alter column settings set default '{}'::jsonb,
  alter column updated_at set default now();

alter table public.species_prediction_defaults
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'species_prediction_defaults'
      and column_name = 'updated_by'
      and udt_name <> 'text'
  ) then
    alter table public.species_prediction_defaults
      alter column updated_by drop default,
      alter column updated_by type text using updated_by::text;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'species_prediction_defaults_map_scope_species_key_key'
      and conrelid = 'public.species_prediction_defaults'::regclass
  ) then
    alter table public.species_prediction_defaults
      add constraint species_prediction_defaults_map_scope_species_key_key
      unique (map_scope, species_key);
  end if;
end $$;

alter table public.species_prediction_defaults enable row level security;

grant select, insert, update, delete on public.species_prediction_defaults to authenticated;

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
with check (public.has_permission(auth.uid(), 'settings.manage'));

drop policy if exists "species_prediction_defaults_update" on public.species_prediction_defaults;
create policy "species_prediction_defaults_update"
on public.species_prediction_defaults
for update
to authenticated
using (public.has_permission(auth.uid(), 'settings.manage'))
with check (public.has_permission(auth.uid(), 'settings.manage'));

drop policy if exists "species_prediction_defaults_delete" on public.species_prediction_defaults;
create policy "species_prediction_defaults_delete"
on public.species_prediction_defaults
for delete
to authenticated
using (public.has_permission(auth.uid(), 'settings.manage'));

drop trigger if exists species_prediction_defaults_updated_at on public.species_prediction_defaults;
create trigger species_prediction_defaults_updated_at
before update on public.species_prediction_defaults
for each row execute function public.update_updated_at_column();
