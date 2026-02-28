alter table public.news_items
  add column if not exists cached_image_url text,
  add column if not exists cached_image_path text;

create or replace view public.news_items_v as
select
  ni.*,
  ns.name as source_name,
  coalesce(ni.cached_image_url, ni.image_url) as display_image_url
from public.news_items ni
left join public.news_sources ns on ns.id = ni.source_id;

grant select on public.news_items_v to anon, authenticated;

notify pgrst, 'reload schema';
