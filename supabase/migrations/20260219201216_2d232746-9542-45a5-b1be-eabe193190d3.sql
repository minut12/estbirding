
-- Create bird_avatar_map table
CREATE TABLE public.bird_avatar_map (
  species_key TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bird_avatar_map ENABLE ROW LEVEL SECURITY;

-- Public read access (anyone can see avatars)
CREATE POLICY "Anyone can read avatars"
  ON public.bird_avatar_map FOR SELECT
  USING (true);

-- Only authenticated users can manage avatars
CREATE POLICY "Authenticated users can insert avatars"
  ON public.bird_avatar_map FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update avatars"
  ON public.bird_avatar_map FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete avatars"
  ON public.bird_avatar_map FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Create storage bucket for bird avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('bird-avatars', 'bird-avatars', true);

-- Public read for bucket
CREATE POLICY "Anyone can read bird avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'bird-avatars');

-- Authenticated users can upload
CREATE POLICY "Authenticated users can upload bird avatars"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'bird-avatars' AND auth.uid() IS NOT NULL);

-- Authenticated users can update
CREATE POLICY "Authenticated users can update bird avatars"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'bird-avatars' AND auth.uid() IS NOT NULL);

-- Authenticated users can delete
CREATE POLICY "Authenticated users can delete bird avatars"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'bird-avatars' AND auth.uid() IS NOT NULL);
