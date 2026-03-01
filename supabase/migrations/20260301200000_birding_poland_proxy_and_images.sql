alter table public.news_items
  add column if not exists cached_image_url text,
  add column if not exists cached_image_path text;

insert into storage.buckets (id, name, public)
select 'news-images', 'news-images', true
where not exists (
  select 1 from storage.buckets where id = 'news-images'
);

update storage.buckets
set public = true
where id = 'news-images';

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'news_images_public_read'
  ) then
    create policy news_images_public_read
      on storage.objects
      for select
      to anon, authenticated
      using (bucket_id = 'news-images');
  end if;
end $$;

drop view if exists public.news_items_v;

create view public.news_items_v as
select
  ni.id,
  ni.created_at,
  ni.updated_at,
  ni.fetched_at,
  ni.published_at,
  ni.archived,
  ni.source_id,
  ns.slug as source_slug,
  ns.name as source_name,
  coalesce(ni.source_key, ns.source_key, ns.key, ns.slug) as source_key,
  ni.external_id,
  ni.guid,
  ni.url,
  ni.permalink_url,
  ni.title,
  ni.summary,
  ni.body,
  ni.content_html,
  ni.raw_json,
  ni.language,
  ni.source_lang,
  ni.title_et,
  ni.body_et,
  ni.translated_title,
  ni.translated_body,
  ni.translation_status,
  ni.translation_error,
  ni.translated_at,
  ni.content_fetch_error,
  ni.content_fetched_at,
  ni.image_url,
  ni.cached_image_url,
  ni.cached_image_path,
  ni.image_url_original,
  ni.image_cached_url,
  coalesce(ni.cached_image_url, ni.image_url) as display_image_url
from public.news_items ni
left join public.news_sources ns on ns.id = ni.source_id;

grant select on public.news_items_v to anon, authenticated;
