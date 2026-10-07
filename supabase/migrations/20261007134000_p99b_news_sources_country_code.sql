-- 20261007134000_p99b_news_sources_country_code.sql
-- P99b: country per news source in the DB (flags + chip labels), so a new source needs no code change.
-- Backfill = the slug map that today lives in CountryFlag.tsx SOURCE_COUNTRY / NewsSourcesSettings.tsx, plus Iceland.
alter table public.news_sources
  add column if not exists country_code text;

alter table public.news_sources
  drop constraint if exists news_sources_country_code_chk;
alter table public.news_sources
  add constraint news_sources_country_code_chk check (country_code is null or country_code ~ '^[A-Z]{2}$');

update public.news_sources
set country_code = case slug
  when 'eoy'               then 'EE'
  when 'birding_estonia'   then 'EE'
  when 'birdlife_suomi'    then 'FI'
  when 'birdlife_poland'   then 'PL'
  when 'birding_poland'    then 'PL'
  when 'birding_belgium'   then 'BE'
  when 'birding_latvia'    then 'LV'
  when 'birding_lithuania' then 'LT'
  when 'birding_iceland'   then 'IS'
  else country_code
end
where country_code is null;
