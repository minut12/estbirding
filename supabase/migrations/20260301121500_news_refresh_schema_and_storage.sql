alter table public.news_items add column if not exists cached_image_url text;
alter table public.news_items add column if not exists cached_image_path text;
alter table public.news_items add column if not exists image_url text;

create unique index if not exists news_items_source_url_uq on public.news_items(source_id, url);

insert into storage.buckets (id, name, public)
values ('news-images', 'news-images', true)
on conflict (id) do update set public = true;
