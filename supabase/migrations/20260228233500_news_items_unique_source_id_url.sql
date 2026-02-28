create unique index if not exists idx_news_items_source_id_url_unique
  on public.news_items (source_id, url);
