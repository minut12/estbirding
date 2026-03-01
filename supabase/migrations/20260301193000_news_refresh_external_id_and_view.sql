alter table public.news_items add column if not exists image_url text;
alter table public.news_items add column if not exists cached_image_url text;
alter table public.news_items add column if not exists cached_image_path text;
alter table public.news_items add column if not exists external_id text;
alter table public.news_items add column if not exists source_id uuid;

create unique index if not exists news_items_external_id_uidx
on public.news_items (external_id)
where external_id is not null and btrim(external_id) <> '';

insert into storage.buckets (id, name, public)
values ('news-images', 'news-images', true)
on conflict (id) do update set public = true;

update public.news_sources
set name = U&'EO\00DC', slug = 'eoy'
where slug in ('eoy', 'eou') or key in ('eoy', 'eou') or name ilike 'EO%';

drop view if exists public.news_items_v;

do $$
declare
  has_created_at boolean;
  has_summary boolean;
  has_description boolean;
  has_body boolean;
  has_content boolean;
  has_content_html boolean;
  has_archived boolean;
  has_fetched_at boolean;
  has_guid boolean;
  has_raw_json boolean;
  has_language boolean;
  has_source_lang boolean;
  sql text;
begin
  select exists (select 1 from information_schema.columns where table_schema='public' and table_name='news_items' and column_name='created_at') into has_created_at;
  select exists (select 1 from information_schema.columns where table_schema='public' and table_name='news_items' and column_name='summary') into has_summary;
  select exists (select 1 from information_schema.columns where table_schema='public' and table_name='news_items' and column_name='description') into has_description;
  select exists (select 1 from information_schema.columns where table_schema='public' and table_name='news_items' and column_name='body') into has_body;
  select exists (select 1 from information_schema.columns where table_schema='public' and table_name='news_items' and column_name='content') into has_content;
  select exists (select 1 from information_schema.columns where table_schema='public' and table_name='news_items' and column_name='content_html') into has_content_html;
  select exists (select 1 from information_schema.columns where table_schema='public' and table_name='news_items' and column_name='archived') into has_archived;
  select exists (select 1 from information_schema.columns where table_schema='public' and table_name='news_items' and column_name='fetched_at') into has_fetched_at;
  select exists (select 1 from information_schema.columns where table_schema='public' and table_name='news_items' and column_name='guid') into has_guid;
  select exists (select 1 from information_schema.columns where table_schema='public' and table_name='news_items' and column_name='raw_json') into has_raw_json;
  select exists (select 1 from information_schema.columns where table_schema='public' and table_name='news_items' and column_name='language') into has_language;
  select exists (select 1 from information_schema.columns where table_schema='public' and table_name='news_items' and column_name='source_lang') into has_source_lang;

  sql := 'create view public.news_items_v as select ' ||
    'ni.id, ni.title, ni.url, ni.published_at, ' ||
    (case when has_created_at then 'ni.created_at' else 'ni.fetched_at as created_at' end) || ', ' ||
    'ni.external_id, ni.source_id, ni.image_url, ni.cached_image_url, ni.cached_image_path, ' ||
    (case when has_summary then 'ni.summary' when has_description then 'ni.description as summary' else 'null::text as summary' end) || ', ' ||
    (case when has_body then 'ni.body' else 'null::text as body' end) || ', ' ||
    (case when has_content then 'ni.content' else 'null::text as content' end) || ', ' ||
    (case when has_content_html then 'ni.content_html' else 'null::text as content_html' end) || ', ' ||
    (case when has_archived then 'ni.archived' else 'false as archived' end) || ', ' ||
    (case when has_fetched_at then 'ni.fetched_at' else 'null::timestamptz as fetched_at' end) || ', ' ||
    (case when has_guid then 'ni.guid' else 'null::text as guid' end) || ', ' ||
    (case when has_raw_json then 'ni.raw_json' else 'null::jsonb as raw_json' end) || ', ' ||
    (case when has_language then 'ni.language' else 'null::text as language' end) || ', ' ||
    (case when has_source_lang then 'ni.source_lang' else 'null::text as source_lang' end) || ', ' ||
    'coalesce(nullif(ns.slug, ''''), ''legacy'') as source_slug, ' ||
    'coalesce(nullif(ns.name, ''''), ''Legacy'') as source_name, ' ||
    'coalesce(ni.cached_image_url, ni.image_url) as display_image_url ' ||
    'from public.news_items ni left join public.news_sources ns on ns.id = ni.source_id';

  execute sql;
end $$;

grant select on public.news_items_v to anon, authenticated;
notify pgrst, 'reload schema';
