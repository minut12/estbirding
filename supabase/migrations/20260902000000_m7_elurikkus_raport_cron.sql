-- M7.4b: elurikkus raport twice daily, replacing n8n vaatluste-koordinaator (fEABCYFcwKzHwUZ5, 06:05/18:05 Tallinn).
-- UTC; 1 h DST drift accepted (2026-08-30). Not to be confused with m7-elurikkus (bulk refresh, 02:15/14:15).
select cron.schedule('m7-elurikkus-raport', '5 3,15 * * *', $$select public.m7_call_ef('elurikkus-orchestrator', '{"source":"schedule"}')$$);
