create unique index if not exists idx_news_items_source_slug_url_unique
  on public.news_items (source_slug, url);
