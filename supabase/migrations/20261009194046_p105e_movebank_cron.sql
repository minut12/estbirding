-- P105e: schedule movebank-refresh (GPS-tracked birds on the Euroopa map).
-- discover: daily 02:40 UTC; refresh: every 3 h at :20. Both return 202 at once and run in the background.
select cron.schedule('m7-movebank-discover', '40 2 * * *',
  $$select public.m7_call_ef('movebank-refresh', '{"mode":"discover"}')$$);
select cron.schedule('m7-movebank-refresh', '20 */3 * * *',
  $$select public.m7_call_ef('movebank-refresh', '{"mode":"refresh","maxStudies":30}')$$);
