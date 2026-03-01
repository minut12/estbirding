-- News schema compatibility migration (runtime-safe)
-- Step 1 SQL inspection queries requested by app team:
-- A)
--   select column_name, data_type
--   from information_schema.columns
--   where table_schema='public' and table_name='news_items'
--   order by ordinal_position;
-- B)
--   select column_name, data_type
--   from information_schema.columns
--   where table_schema='public' and table_name='news_sources'
--   order by ordinal_position;
-- C)
--   select table_name
--   from information_schema.views
--   where table_schema='public' and table_name='news_items_v';
--   select column_name, data_type
--   from information_schema.columns
--   where table_schema='public' and table_name='news_items_v'
--   order by ordinal_position;

alter table public.news_items
  add column if not exists image_url text,
  add column if not exists cached_image_url text,
  add column if not exists cached_image_path text,
  add column if not exists published_at timestamptz,
  add column if not exists created_at timestamptz default now();

create or replace view public.news_items_v as
select
  ni.id,
  ni.source_id,
  coalesce(ns.key, ns.source_key, ns.slug, ni.source_key, ni.source_slug, 'unknown') as source_key,
  coalesce(nullif(ns.name, ''), nullif(ns.key, ''), nullif(ns.slug, ''), nullif(ni.source_slug, ''), 'Unknown source') as source_name,
  coalesce(ns.slug, ni.source_slug) as source_slug,
  ni.title,
  coalesce(ni.permalink_url, ni.url) as url,
  ni.permalink_url,
  ni.summary,
  ni.body,
  ni.published_at,
  ni.created_at,
  ni.image_url,
  coalesce(ni.cached_image_url, ni.image_cached_url) as cached_image_url,
  ni.cached_image_path,
  coalesce(ni.archived, false) as is_archived
from public.news_items ni
left join public.news_sources ns on ns.id = ni.source_id;

grant select on public.news_items_v to anon, authenticated;

notify pgrst, 'reload schema';
