ALTER TABLE public.news_items
  ADD COLUMN IF NOT EXISTS title_et_v2           text,
  ADD COLUMN IF NOT EXISTS body_et_v2            text,
  ADD COLUMN IF NOT EXISTS translation_engine    text,
  ADD COLUMN IF NOT EXISTS translation_v2_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS translation_v2_error  text,
  ADD COLUMN IF NOT EXISTS translated_v2_at      timestamptz;