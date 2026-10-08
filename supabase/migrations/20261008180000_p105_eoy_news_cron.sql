-- 20261008180000_p105_eoy_news_cron.sql
-- P105: EOU (eoy.ee) news was only scraped once a day inside news-refresh (05:00 UTC) and arrived
-- 2-6 days late. Own pg_cron job calls fetch-eoy-news 4x/day (upsert by guid, no duplicates).
-- 04:50/08:50/12:50/16:50 UTC = 07:50/11:50/15:50/19:50 Tallinn summer time (08:50... in winter).
select cron.schedule(
  'm7-eoy-news',
  '50 4,8,12,16 * * *',
  $$select public.m7_call_ef('fetch-eoy-news', '{}')$$
);
