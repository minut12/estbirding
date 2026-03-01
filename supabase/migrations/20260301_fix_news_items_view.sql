-- Stabilize news schema/view for frontend compatibility and PostgREST cache.

alter table public.news_items
  add column if not exists cached_image_url text,
  add column if not exists cached_image_path text,
  add column if not exists image_cached_url text;

update public.news_items
set cached_image_url = image_cached_url
where cached_image_url is null
  and image_cached_url is not null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'news_sources'
      and column_name = 'legacy_id'
  ) then
    execute $q$
      update public.news_items ni
      set source_id = ns.id
      from public.news_sources ns
      where ni.source_id is null
        and (
          ni.source_slug = ns.legacy_id
          or ni.source_key = ns.legacy_id
          or ni.source_slug = ns.slug
        )
    $q$;
  else
    execute $q$
      update public.news_items ni
      set source_id = ns.id
      from public.news_sources ns
      where ni.source_id is null
        and ni.source_slug = ns.slug
    $q$;
  end if;
end $$;

drop view if exists public.news_items_v;

create view public.news_items_v as
select
  ni.*,
  coalesce(
    ns.name,
    nullif(ni.source_slug, ''),
    nullif(ni.source_key, ''),
    'Legacy'
  ) as source_name,
  coalesce(
    ns.slug,
    nullif(ni.source_slug, ''),
    nullif(ni.source_key, ''),
    nullif(ni.source_id::text, ''),
    'legacy'
  ) as source_slug_v,
  coalesce(ni.cached_image_url, ni.image_cached_url, ni.image_url) as display_image_url
from public.news_items ni
left join public.news_sources ns
  on ns.id = ni.source_id
  or ns.slug = ni.source_slug;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'news_items_v'
      and column_name = 'source_slug'
  ) then
    execute 'alter view public.news_items_v rename column source_slug to source_slug_raw';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'news_items_v'
      and column_name = 'source_slug_v'
  ) then
    execute 'alter view public.news_items_v rename column source_slug_v to source_slug';
  end if;
end $$;

grant select on public.news_items_v to anon, authenticated;
notify pgrst, 'reload schema';
