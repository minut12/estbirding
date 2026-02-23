ALTER TABLE public.news_items
  ADD COLUMN IF NOT EXISTS source_lang text,
  ADD COLUMN IF NOT EXISTS translated_title text,
  ADD COLUMN IF NOT EXISTS translated_body text,
  ADD COLUMN IF NOT EXISTS translated_at timestamptz,
  ADD COLUMN IF NOT EXISTS translation_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS translation_error text,
  ADD COLUMN IF NOT EXISTS cached_image_url text;

CREATE INDEX IF NOT EXISTS idx_news_items_source_key_published_desc
  ON public.news_items (source_key, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_news_items_source_key_translated_at_desc
  ON public.news_items (source_key, translated_at DESC);

INSERT INTO storage.buckets (id, name, public)
SELECT 'news-images', 'news-images', true
WHERE NOT EXISTS (
  SELECT 1 FROM storage.buckets WHERE id = 'news-images'
);
