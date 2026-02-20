
ALTER TABLE public.news_items
  ADD COLUMN IF NOT EXISTS content_fetched_at timestamptz,
  ADD COLUMN IF NOT EXISTS content_fetch_error text;
