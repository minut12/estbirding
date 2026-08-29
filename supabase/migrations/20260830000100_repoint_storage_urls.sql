-- M5 Phase E: repoint storage URLs stored as DATA.
--
-- Repointing the code (commit 92bd10c) left 2 043 rows still holding absolute
-- URLs to the old project's storage host, so a logged-in session still issued
-- 45 of 82 requests to eenwcyuyugyrjgpivxrq.supabase.co.
--
-- Columns below come from a scan of every text/varchar/json/jsonb column in
-- public (2026-08-29): the seven here were the only ones matching.
--   bird_avatar_map.public_url          1464
--   news_items.cached_image_url          232
--   news_items.image_url                  83
--   prediction_jobs.result_json           31
--   prediction_jobs.error_json            10
--   toenaosus_raport.entries             208
--   toenaosus_raport.corridor_watchlist   15
--
-- Object keys are identical on both projects (M4b uploaded 1 785 files under the
-- same names), so swapping the host is sufficient — no path rewriting needed.

update public.bird_avatar_map
   set public_url = replace(public_url,
         'https://eenwcyuyugyrjgpivxrq.supabase.co', 'https://rfjhrosxbaihyrnbmmbl.supabase.co')
 where public_url like '%eenwcyuyugyrjgpivxrq%';

update public.news_items
   set image_url = replace(image_url,
         'https://eenwcyuyugyrjgpivxrq.supabase.co', 'https://rfjhrosxbaihyrnbmmbl.supabase.co')
 where image_url like '%eenwcyuyugyrjgpivxrq%';

update public.news_items
   set cached_image_url = replace(cached_image_url,
         'https://eenwcyuyugyrjgpivxrq.supabase.co', 'https://rfjhrosxbaihyrnbmmbl.supabase.co')
 where cached_image_url like '%eenwcyuyugyrjgpivxrq%';

-- jsonb: round-trip through text. Safe here because the host substring never
-- appears in a key, only in URL values, so structure is preserved.
update public.toenaosus_raport
   set entries = replace(entries::text,
         'https://eenwcyuyugyrjgpivxrq.supabase.co', 'https://rfjhrosxbaihyrnbmmbl.supabase.co')::jsonb
 where entries::text like '%eenwcyuyugyrjgpivxrq%';

update public.toenaosus_raport
   set corridor_watchlist = replace(corridor_watchlist::text,
         'https://eenwcyuyugyrjgpivxrq.supabase.co', 'https://rfjhrosxbaihyrnbmmbl.supabase.co')::jsonb
 where corridor_watchlist::text like '%eenwcyuyugyrjgpivxrq%';

-- prediction_jobs.result_json / error_json are deliberately NOT rewritten.
--
-- They do match a bare-project-ref search (31 + 10 rows), which is why they
-- appeared in the initial scan, but they contain NO old-host URL — verified:
-- `like '%eenwcyuyugyrjgpivxrq.supabase.co%'` returns 0 rows for both. What they
-- hold is diagnostic metadata written by species-prediction's
-- getDeployedProjectRef():  "deployedProjectRef": "eenwcyuyugyrjgpivxrq"
--
-- Those jobs really did run on the old project (2026-03-17 .. 2026-07-01), so the
-- value is a historical fact, not a broken link. Rewriting it would falsify the
-- record and fixes no request: nothing dereferences it as a URL.
