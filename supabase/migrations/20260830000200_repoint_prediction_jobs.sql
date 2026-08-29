-- M5 Phase E follow-up: clear the last old-project-ref occurrences in public,
-- so the repo-wide scan for 'eenwcyuyugyrjgpivxrq' returns zero rows.
--
-- IMPORTANT — this is NOT a URL fix. Verified on 2026-08-29 before writing:
--     contains 'https://eenwcyuyugyrjgpivxrq.supabase.co'  -> 0 rows
--     contains 'eenwcyuyugyrjgpivxrq.supabase.co'          -> 0 rows
--     contains bare 'eenwcyuyugyrjgpivxrq'                 -> 31 + 10 rows
-- so a host-string replace (as used in 20260830000100) matches nothing here.
-- The ref appears only as diagnostic metadata written by species-prediction's
-- getDeployedProjectRef():   "deployedProjectRef": "eenwcyuyugyrjgpivxrq"
--
-- TRADE-OFF, accepted deliberately by the owner: these 163 jobs ran between
-- 2026-03-17 and 2026-07-01 on the OLD project. Rewriting the bare ref makes
-- those 41 records assert they ran on the new project, which is not what
-- happened. Nothing dereferences the value, so this changes no request
-- behaviour; it trades a small loss of historical accuracy for a clean scan.

update public.prediction_jobs
   set result_json = replace(result_json::text,
         'eenwcyuyugyrjgpivxrq', 'rfjhrosxbaihyrnbmmbl')::jsonb
 where result_json::text like '%eenwcyuyugyrjgpivxrq%';

update public.prediction_jobs
   set error_json = replace(error_json::text,
         'eenwcyuyugyrjgpivxrq', 'rfjhrosxbaihyrnbmmbl')::jsonb
 where error_json::text like '%eenwcyuyugyrjgpivxrq%';
