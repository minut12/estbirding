create or replace view public.news_items_v as
select
  ni.*,
  coalesce(
    to_jsonb(ns)->>'label',
    to_jsonb(ns)->>'display_name',
    to_jsonb(ns)->>'name',
    to_jsonb(ns)->>'source_key',
    to_jsonb(ns)->>'source_slug',
    to_jsonb(ns)->>'slug',
    ni.source_key,
    ni.source_slug
  ) as source_name,
  coalesce(
    nullif(to_jsonb(ni)->>'cached_image_url', ''),
    nullif(ni.image_url, '')
  ) as thumbnail_url
from public.news_items ni
left join public.news_sources ns
  on (to_jsonb(ns)->>'source_slug' = ni.source_slug)
  or (to_jsonb(ns)->>'slug' = ni.source_slug)
  or (to_jsonb(ns)->>'source_key' = ni.source_key)
  or (to_jsonb(ns)->>'key' = ni.source_key);

grant select on public.news_items_v to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'news_items_source_slug_guid_unique'
  ) then
    alter table public.news_items
      add constraint news_items_source_slug_guid_unique unique (source_slug, guid);
  end if;
end $$;

notify pgrst, 'reload schema';
