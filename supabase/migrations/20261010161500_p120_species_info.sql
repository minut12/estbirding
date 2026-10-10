-- 20261010161500_p120_species_info.sql
-- P120: per-species info card ("i" on Linnuliigid map cards).
-- One row per eBird species code. Text is eBird's identification text, saved by
-- Kristian via the "-> EstBirds" bookmarklet on ebird.org/species/<code>, and
-- machine-translated EN->ET by TartuNLP in the species-info-save Edge Function.
-- Photo (optional) comes from iNaturalist, CC-licensed only.
-- Reads: anon + authenticated. Writes: service_role only (no write policies).

create table if not exists public.species_info (
  ebird_code     text primary key check (ebird_code ~ '^[a-z0-9]{3,12}$'),
  com_name_en    text,
  sci_name       text,
  id_text_en     text not null check (length(id_text_en) between 20 and 4000),
  id_text_et     text,
  translator     text check (translator in ('tartunlp')),
  translated_at  timestamptz,
  source_url     text not null,
  photo_url      text,
  photo_credit   text,
  photo_license  text,
  saved_at       timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.species_info is
  'P120 species info card: eBird identification text (credited "Tekst: eBird.org") + TartuNLP Estonian translation + optional iNaturalist photo. Written only by Edge Function species-info-save.';

alter table public.species_info enable row level security;

drop policy if exists species_info_read on public.species_info;
create policy species_info_read on public.species_info
  for select to anon, authenticated using (true);

revoke insert, update, delete on public.species_info from anon, authenticated;
grant select on public.species_info to anon, authenticated;
