
-- Add image_url_original column to news_items
ALTER TABLE public.news_items ADD COLUMN IF NOT EXISTS image_url_original text;

-- Create news-images storage bucket (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('news-images', 'news-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read on news-images bucket
CREATE POLICY "Public read news images"
ON storage.objects FOR SELECT
USING (bucket_id = 'news-images');

-- Allow service role to insert/update (edge functions use service role)
CREATE POLICY "Service role can upload news images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'news-images');

CREATE POLICY "Service role can update news images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'news-images');
