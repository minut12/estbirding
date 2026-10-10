-- 20261010173000_p120g_species_info_llm.sql
-- P120g: species info text is translated by the free LLM chain (Gemini -> Mistral,
-- never Claude) instead of TartuNLP. Estonian order/family names come from the EOU
-- checklist (Linnud.txt); name_glossary holds the English -> Estonian bird names
-- found in id_text_en, fed to the LLM prompt. Applied live 2026-10-10 via connector.

alter table public.species_info
  add column if not exists order_com_et text,
  add column if not exists name_glossary jsonb;

alter table public.species_info drop constraint if exists species_info_translator_check;
alter table public.species_info add constraint species_info_translator_check
  check (translator is null or translator in ('tartunlp','gemini','mistral'));
