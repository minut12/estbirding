-- M7.4c: eBird vaatluste raport twice daily, replacing n8n vaatluste-koordinaator (0Uq1kLK8wwfZ9PBJ, 06:00/18:00 Tallinn). UTC; DST drift accepted.
select cron.schedule('m7-vaatluste-raport', '0 3,15 * * *', $$select public.m7_call_ef('vaatluste-orchestrator', '{"source":"schedule"}')$$);
