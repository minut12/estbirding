alter table public.news_items add column if not exists cached_image_url text;
alter table public.news_items add column if not exists cached_image_path text;

create unique index if not exists news_items_source_slug_guid_uq
on public.news_items(source_slug, guid);

update public.news_sources
set name = 'EOÜ'
where lower(coalesce(slug, '')) in ('eoy', 'eou')
   or lower(coalesce(name, '')) like 'eo%';
