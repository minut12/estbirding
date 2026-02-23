ALTER TABLE public.news_items
  ADD COLUMN IF NOT EXISTS lang text,
  ADD COLUMN IF NOT EXISTS title_et text,
  ADD COLUMN IF NOT EXISTS body_et text,
  ADD COLUMN IF NOT EXISTS translated_at timestamptz,
  ADD COLUMN IF NOT EXISTS translate_hash text;

CREATE INDEX IF NOT EXISTS idx_news_items_source_key_translated_at
  ON public.news_items (source_key, translated_at DESC);
