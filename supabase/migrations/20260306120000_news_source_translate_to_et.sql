alter table public.news_sources
  add column if not exists translate_to_et boolean not null default false;

update public.news_sources
set translate_to_et = false,
    name = 'EOÜ'
where slug = 'eoy' or name = 'EOÜ' or name = 'EOÃœ';

update public.news_sources
set translate_to_et = true
where coalesce(slug, '') <> 'eoy'
  and coalesce(name, '') <> 'EOÜ'
  and type = 'rss'
  and translate_to_et = false;
