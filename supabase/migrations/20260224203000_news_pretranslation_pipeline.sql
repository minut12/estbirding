BEGIN;

create extension if not exists pgcrypto;

alter table if exists public.news_sources
  add column if not exists source_key text,
  add column if not exists url text,
  add column if not exists source_lang text,
  add column if not exists target_lang text,
  add column if not exists enabled boolean default true;

update public.news_sources
set
  source_key = coalesce(nullif(source_key, ''), nullif(key, ''), nullif(slug, ''), 'unknown'),
  url = coalesce(nullif(url, ''), nullif(feed_url, ''), nullif(fetch_url, ''), nullif(homepage_url, ''), 'https://example.com'),
  source_lang = coalesce(nullif(source_lang, ''), case when coalesce(source_key, key, slug, '') ilike '%poland%' then 'pl' else 'et' end),
  target_lang = coalesce(nullif(target_lang, ''), 'et'),
  enabled = coalesce(enabled, is_enabled, is_active, true);

alter table public.news_sources
  alter column source_key set not null,
  alter column url set not null,
  alter column source_lang set not null,
  alter column target_lang set not null,
  alter column enabled set default true;

create unique index if not exists news_sources_source_key_key on public.news_sources(source_key);

alter table if exists public.news_items
  add column if not exists external_id text,
  add column if not exists item_url text,
  add column if not exists content text,
  add column if not exists source_lang text,
  add column if not exists content_hash text,
  add column if not exists fetched_at timestamptz default now();

update public.news_items
set
  external_id = coalesce(nullif(external_id, ''), nullif(guid, '')),
  item_url = coalesce(nullif(item_url, ''), nullif(url, ''), nullif(permalink_url, ''), 'https://example.com'),
  content = coalesce(content, body, content_html),
  source_lang = coalesce(nullif(source_lang, ''), nullif(lang, ''), nullif(language, ''), 'et'),
  fetched_at = coalesce(fetched_at, created_at, now());

update public.news_items
set content_hash = encode(digest(coalesce(title,'') || E'\n' || coalesce(summary,'') || E'\n' || coalesce(content,''), 'sha256'), 'hex')
where content_hash is null;

alter table public.news_items
  alter column item_url set not null,
  alter column source_lang set not null,
  alter column content_hash set not null,
  alter column fetched_at set default now();

alter table public.news_items
  drop constraint if exists news_items_source_id_external_id_key;

create unique index if not exists news_items_source_id_external_id_key on public.news_items(source_id, external_id);
create unique index if not exists news_items_source_id_content_hash_key on public.news_items(source_id, content_hash);
create index if not exists news_items_published_at_desc_idx on public.news_items(published_at desc);
create index if not exists news_items_source_id_published_at_desc_idx on public.news_items(source_id, published_at desc);

create table if not exists public.news_translations (
  item_id uuid not null references public.news_items(id) on delete cascade,
  target_lang text not null,
  title text not null,
  summary text null,
  content text null,
  status text not null default 'done' check (status in ('pending', 'done', 'failed')),
  tries int not null default 0,
  last_error text null,
  updated_at timestamptz not null default now(),
  primary key (item_id, target_lang)
);

create index if not exists news_translations_status_tries_idx on public.news_translations(status, tries);

alter table public.news_sources enable row level security;
alter table public.news_items enable row level security;
alter table public.news_translations enable row level security;

DROP POLICY IF EXISTS "Anyone can read news sources" ON public.news_sources;
DROP POLICY IF EXISTS "Anyone can read news items" ON public.news_items;

drop view if exists public.news_items_public;
create view public.news_items_public as
select
  ni.id,
  ns.source_key,
  ns.name as source_name,
  ni.item_url,
  ni.published_at,
  ni.source_lang,
  ns.target_lang,
  coalesce(nt.title, ni.title) as title_best,
  coalesce(nt.summary, ni.summary) as summary_best,
  coalesce(nt.content, ni.content) as content_best,
  (nt.item_id is not null) as is_translated
from public.news_items ni
join public.news_sources ns on ns.id = ni.source_id
left join public.news_translations nt on nt.item_id = ni.id and nt.target_lang = ns.target_lang
where ns.enabled = true;

grant select on public.news_items_public to anon, authenticated;
revoke all on public.news_sources from anon, authenticated;
revoke all on public.news_items from anon, authenticated;
revoke all on public.news_translations from anon, authenticated;

COMMIT;
