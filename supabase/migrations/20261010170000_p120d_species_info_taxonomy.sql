-- 20261010170000_p120d_species_info_taxonomy.sql
-- P120d: taxonomy for the species info modal (lifermap-style "Taksonoomia" chips).
-- Collected in English by the bookmarklet from the public eBird taxonomy API
-- (order, familyComName, familySciName, category); family_com_et is the TartuNLP
-- translation of family_com_en, done last in species-info-save.

alter table public.species_info
  add column if not exists order_sci     text,
  add column if not exists family_sci    text,
  add column if not exists family_com_en text,
  add column if not exists family_com_et text,
  add column if not exists category      text;

alter table public.species_info drop constraint if exists species_info_category_check;
alter table public.species_info add constraint species_info_category_check
  check (category is null or category in ('species','issf','slash','spuh','hybrid','intergrade','domestic','form'));
