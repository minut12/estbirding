CREATE INDEX IF NOT EXISTS idx_news_items_source_key_published
  ON public.news_items (source_key, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_news_items_source_key_translated_at
  ON public.news_items (source_key, translated_at DESC);
