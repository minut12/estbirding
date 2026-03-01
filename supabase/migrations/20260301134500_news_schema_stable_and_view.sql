-- Safe compatibility schema for News.
create table if not exists public.news_sources (
  id text primary key,
  name text not null,
  type text not null,
  url text not null,
  enabled boolean not null default true
);

alter table public.news_sources add column if not exists name text;
alter table public.news_sources add column if not exists type text;
alter table public.news_sources add column if not exists url text;
alter table public.news_sources add column if not exists enabled boolean default true;

alter table public.news_items add column if not exists source_id text;
alter table public.news_items add column if not exists title text;
alter table public.news_items add column if not exists url text;
alter table public.news_items add column if not exists published_at timestamptz;
alter table public.news_items add column if not exists created_at timestamptz default now();
alter table public.news_items add column if not exists summary text;
alter table public.news_items add column if not exists content text;
alter table public.news_items add column if not exists image_url text;
alter table public.news_items add column if not exists cached_image_url text;
alter table public.news_items add column if not exists image_path text;

create unique index if not exists news_items_source_id_url_uq
  on public.news_items (source_id, url);

create or replace view public.news_items_v as
select
  ni.id,
  ni.source_id,
  ns.name as source_name,
  ns.id as source_key,
  ni.source_slug,
  ni.title,
  ni.url,
  ni.permalink_url,
  ni.published_at,
  ni.created_at,
  ni.summary,
  coalesce(ni.content, ni.body) as content,
  ni.content_html,
  ni.image_url,
  ni.cached_image_url,
  coalesce(ni.cached_image_url, ni.image_url) as display_image_url,
  coalesce(ni.archived, false) as archived,
  coalesce(ni.archived, false) as is_archived,
  ni.fetched_at,
  ni.language,
  ni.source_lang,
  ni.guid,
  ni.raw_json
from public.news_items ni
left join public.news_sources ns on ns.id = ni.source_id;

grant select on public.news_items to anon, authenticated;
grant select on public.news_items_v to anon, authenticated;
grant select on public.news_sources to anon, authenticated;

notify pgrst, 'reload schema';
