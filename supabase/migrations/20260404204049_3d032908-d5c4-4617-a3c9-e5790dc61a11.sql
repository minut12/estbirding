ALTER TABLE public.news_items ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_news_items_archived ON public.news_items (archived);