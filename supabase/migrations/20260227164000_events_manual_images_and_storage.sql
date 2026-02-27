alter table public.events_manual
  add column if not exists image_url text,
  add column if not exists image_path text;

insert into storage.buckets (id, name, public)
values ('event-images', 'event-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public read event images" on storage.objects;
create policy "Public read event images"
on storage.objects
for select
to public
using (bucket_id = 'event-images');
