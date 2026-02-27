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
-- Upload/delete should go through the events-image-upload edge function.
