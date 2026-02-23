alter table public.news_items
  add column if not exists title_et text,
  add column if not exists body_et text,
  add column if not exists source_lang text,
  add column if not exists translated_at timestamptz,
  add column if not exists translation_status text default 'pending',
  add column if not exists translation_error text,
  add column if not exists translate_hash text;

create index if not exists news_items_sourcekey_pub_idx
  on public.news_items (source_key, published_at desc);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'news_sources'
      and column_name = 'source_key'
  ) then
    update public.news_items ni
    set source_key = ns.source_key
    from public.news_sources ns
    where ni.source_key is null
      and ni.source_slug = ns.slug
      and ns.source_key is not null
      and ns.source_key <> '';
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'news_sources'
      and column_name = 'key'
  ) then
    update public.news_items ni
    set source_key = ns.key
    from public.news_sources ns
    where ni.source_key is null
      and ni.source_slug = ns.slug
      and ns.key is not null
      and ns.key <> '';
  end if;
end $$;

update public.news_items
set source_key = 'eoy'
where source_key is null
  and (
    coalesce(permalink_url, '') ilike '%eoy.ee%'
    or coalesce(url, '') ilike '%eoy.ee%'
    or coalesce(raw_json::text, '') ilike '%eoy.ee%'
  );

update public.news_items
set source_key = 'facebook_birdingpoland'
where source_key is null
  and (
    coalesce(permalink_url, '') ilike '%birdingpoland%'
    or coalesce(url, '') ilike '%birdingpoland%'
    or coalesce(raw_json::text, '') ilike '%birdingpoland%'
    or coalesce(permalink_url, '') ilike '%facebook.com%'
    or coalesce(raw_json::text, '') ilike '%facebook.com/birdingpoland%'
  );

update public.news_items
set source_key = coalesce(source_key, source_slug, 'unknown')
where source_key is null;
