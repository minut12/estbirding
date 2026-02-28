drop view if exists public.news_items_v;

create unique index if not exists news_items_source_url_uq
  on public.news_items(source_id, url);
