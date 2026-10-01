-- P86e: per-item EOU glossary used by the news-translate-v2 glossary pass.
alter table public.news_items add column if not exists species_glossary jsonb;
