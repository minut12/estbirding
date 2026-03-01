-- Keep news reads stable even when table shape evolves.
-- The app reads from public.news_items_v so it gets source_name/display_image_url safely.
alter table public.news_items
  add column if not exists cached_image_url text,
  add column if not exists cached_image_path text;

create or replace view public.news_items_v as
select
  ni.id,
  ni.title,
  ni.url,
  ni.permalink_url,
  ni.published_at,
  coalesce(ni.created_at, ni.fetched_at) as created_at,
  ni.source_id,
  ni.source_key,
  ni.source_slug,
  coalesce(ns.name, ni.source_slug, 'unknown') as source_name,
  ni.image_url,
  coalesce(ni.cached_image_url, ni.image_cached_url) as cached_image_url,
  coalesce(ni.cached_image_url, ni.image_cached_url, ni.image_url) as display_image_url,
  ni.summary,
  ni.body,
  ni.content_html,
  coalesce(ni.archived, false) as is_archived,
  ni.language,
  ni.source_lang,
  ni.guid,
  ni.raw_json,
  ni.fetched_at
from public.news_items ni
left join public.news_sources ns
  on ns.slug = ni.source_slug
  or ns.key = ni.source_key;

grant select on public.news_items_v to anon, authenticated;
notify pgrst, 'reload schema';
