
-- ============================================================
-- Security Fix: bird_avatar_map table — restrict writes to authenticated
-- ============================================================

-- Drop overly permissive public write policies
DROP POLICY IF EXISTS "Anyone can insert avatars" ON public.bird_avatar_map;
DROP POLICY IF EXISTS "Anyone can update avatars" ON public.bird_avatar_map;
DROP POLICY IF EXISTS "Anyone can delete avatars" ON public.bird_avatar_map;

-- Recreate write policies for authenticated users only
CREATE POLICY "Authenticated can insert avatars"
ON public.bird_avatar_map FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated can update avatars"
ON public.bird_avatar_map FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated can delete avatars"
ON public.bird_avatar_map FOR DELETE
TO authenticated
USING (true);

-- ============================================================
-- Security Fix: bird-avatars storage bucket — restrict writes to authenticated
-- ============================================================

DROP POLICY IF EXISTS "Anyone can upload bird avatars" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update bird avatars" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete bird avatars" ON storage.objects;

CREATE POLICY "Authenticated can upload bird avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'bird-avatars');

CREATE POLICY "Authenticated can update bird avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'bird-avatars');

CREATE POLICY "Authenticated can delete bird avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'bird-avatars');

-- ============================================================
-- Security Fix: news-images storage bucket — restrict writes
-- ============================================================

DROP POLICY IF EXISTS "Service role can upload news images" ON storage.objects;
DROP POLICY IF EXISTS "Service role can update news images" ON storage.objects;

-- Service role bypasses RLS, so no explicit write policies needed.
-- If needed for authenticated users in future, add scoped policies here.

-- ============================================================
-- Security Fix: news_items_v view — use security_invoker
-- ============================================================

DROP VIEW IF EXISTS public.news_items_v;

CREATE VIEW public.news_items_v
WITH (security_invoker = true)
AS
SELECT
  ni.id,
  ni.source_id,
  ni.title,
  ni.summary,
  ni.content_html,
  ni.url,
  ni.image_url,
  ni.published_at,
  ni.language,
  ni.guid,
  ni.created_at,
  ni.updated_at,
  ni.content_fetched_at,
  ni.content_fetch_error,
  ni.image_url_original,
  ni.source_key,
  ni.external_id,
  ni.body,
  ni.permalink_url,
  ni.fetched_at,
  ni.archived,
  ni.raw_json,
  ni.source_lang,
  ni.translated_title,
  ni.translated_body,
  ni.translation_status,
  ni.translated_at,
  ni.title_et,
  ni.body_et,
  ni.image_cached_url,
  ni.translation_error,
  ni.cached_image_url,
  ni.cached_image_path,
  COALESCE(ns.slug, ni.source_slug, ni.source_id::text, 'legacy'::text) AS source_slug,
  COALESCE(ns.name, ni.source_id::text, 'Legacy'::text) AS source_name,
  COALESCE(ni.cached_image_url, ni.image_url) AS display_image_url
FROM news_items ni
LEFT JOIN news_sources ns ON ns.id = ni.source_id;

GRANT SELECT ON public.news_items_v TO anon, authenticated;
