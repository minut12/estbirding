-- 1) Add optional columns (safe if already exist)
alter table public.news_items
  add column if not exists image_url text,
  add column if not exists cached_image_url text,
  add column if not exists image_strategy text;

-- 2) Create a stable view the UI can query (fixes "news_items_v not found")
drop view if exists public.news_items_v;
create view public.news_items_v as
select
  ni.id,
  ni.source_id,
  ns.key   as source_key,
  ns.slug  as source_slug,
  ns.name  as source_name,
  ni.title,
  ni.permalink_url,
  ni.published_at,
  ni.created_at,
  ni.updated_at,
  ni.archived as is_archived,
  ni.image_url,
  ni.cached_image_url,
  coalesce(ni.cached_image_url, ni.image_url) as display_image_url,
  ni.image_strategy,
  left(coalesce(nullif(ni.body,''), ''), 240) as excerpt
from public.news_items ni
left join public.news_sources ns on ns.id = ni.source_id;

-- 3) Ensure API roles can read the view (RLS still applies from underlying tables)
grant select on public.news_items_v to anon, authenticated;

-- 4) Reload schema cache
notify pgrst, 'reload schema';
