
-- Allow public writes for bird avatars (personal app, no auth)
DROP POLICY "Authenticated users can insert avatars" ON public.bird_avatar_map;
DROP POLICY "Authenticated users can update avatars" ON public.bird_avatar_map;
DROP POLICY "Authenticated users can delete avatars" ON public.bird_avatar_map;

CREATE POLICY "Anyone can insert avatars" ON public.bird_avatar_map FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update avatars" ON public.bird_avatar_map FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete avatars" ON public.bird_avatar_map FOR DELETE USING (true);

DROP POLICY "Authenticated users can upload bird avatars" ON storage.objects;
DROP POLICY "Authenticated users can update bird avatars" ON storage.objects;
DROP POLICY "Authenticated users can delete bird avatars" ON storage.objects;

CREATE POLICY "Anyone can upload bird avatars" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'bird-avatars');
CREATE POLICY "Anyone can update bird avatars" ON storage.objects FOR UPDATE USING (bucket_id = 'bird-avatars');
CREATE POLICY "Anyone can delete bird avatars" ON storage.objects FOR DELETE USING (bucket_id = 'bird-avatars');
