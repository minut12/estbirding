
-- Add useful indexes for news_items list view
CREATE INDEX IF NOT EXISTS idx_news_items_archived_published
  ON public.news_items (archived, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_news_items_source_slug_published
  ON public.news_items (source_slug, published_at DESC);

-- Unique index on (source_slug, external_id) for dedup
CREATE UNIQUE INDEX IF NOT EXISTS idx_news_items_source_external
  ON public.news_items (source_slug, external_id)
  WHERE source_slug IS NOT NULL AND external_id IS NOT NULL;

-- Update Birding Poland type from 'facebook' to 'rss'
UPDATE public.news_sources
SET type = 'rss'
WHERE slug = 'facebook_birdingpoland' AND type = 'facebook';
