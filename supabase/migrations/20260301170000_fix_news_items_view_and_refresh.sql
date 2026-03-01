update public.news_sources
set name = U&'EO\00DC'
where slug = 'eoy';

alter table public.news_items add column if not exists image_url text;
alter table public.news_items add column if not exists cached_image_url text;
alter table public.news_items add column if not exists source_slug text;
alter table public.news_items add column if not exists source_key text;

create unique index if not exists news_items_source_key_uidx
on public.news_items(source_key);

drop view if exists public.news_items_v;

create view public.news_items_v as
select
  ni.id,
  ni.title,
  ni.url,
  ni.published_at,
  ni.created_at,
  ni.source_id,
  coalesce(nullif(ni.source_slug,''), ns.slug, ni.source_id::text) as source_slug,
  coalesce(ns.name, 'Legacy') as source_name,
  ni.image_url,
  ni.cached_image_url,
  coalesce(ni.cached_image_url, ni.image_url) as display_image_url
from public.news_items ni
left join public.news_sources ns on ns.id = ni.source_id;

grant select on public.news_items_v to anon, authenticated;
notify pgrst, 'reload schema';
