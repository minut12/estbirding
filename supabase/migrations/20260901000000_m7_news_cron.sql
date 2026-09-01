-- M7.3: daily news ingest + ET translation, replacing n8n estbirding-news-ingest-translate-v13
-- (id 5KvMxoDgMlc2nJcL, schedule trigger 08:00 Tallinn).
--
-- Two jobs so the ingest never shares the translate EF's 150 s edge-gateway budget:
--   m7-news-ingest  05:00 UTC -> news-refresh        (measured 2026-09-01: 18.4 s)
--   m7-news         05:10 UTC -> news-translate-v2   (skipIngest, ~15 s per Sonnet call)
-- The 10 min gap is slack, not a dependency: news-translate-v2 simply picks up whatever
-- news-refresh has already inserted, and leftovers roll to the next tick.
--
-- Schedules are UTC. Tallinn summer time is UTC+3, winter UTC+2, so the wall-clock
-- time these jobs fire drifts by 1 h across the DST boundary. Accepted (2026-08-30).
--
-- The ingest body is the exact JSON the n8n "Ingest (news-refresh)" node sent.
-- Depends on public.m7_call_ef from 20260831000000_m7_cron.sql, which sends the
-- x-webhook-secret header: news-refresh ignores it (it has no auth check at all),
-- while news-translate-v2 / get-news-untranslated-v2 / update-news-translation-v2
-- all require it.

select cron.schedule('m7-news-ingest', '0 5 * * *',  $$select public.m7_call_ef('news-refresh', '{"reason":"scheduled","cache_images":true,"cache_limit":10,"translateForeignNews":true}')$$);
select cron.schedule('m7-news',        '10 5 * * *', $$select public.m7_call_ef('news-translate-v2', '{"limit":10,"skipIngest":true}')$$);
