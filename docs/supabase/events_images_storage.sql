-- Run in Supabase SQL editor for event images storage setup
insert into storage.buckets (id, name, public)
values ('event-images', 'event-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public read event images" on storage.objects;
create policy "Public read event images"
on storage.objects
for select
to public
using (bucket_id = 'event-images');

-- No anon insert/update/delete policy is created.
-- If uploading directly from the app with supabase.storage, add write policies too, for example:
-- create policy "App upload event images"
-- on storage.objects
-- for insert
-- to anon, authenticated
-- with check (bucket_id = 'event-images');
--
-- create policy "App delete event images"
-- on storage.objects
-- for delete
-- to anon, authenticated
-- using (bucket_id = 'event-images');
