-- P151 (2026-10-16): Naabermaad (ebird_rare_observations) + near-Estonia pushes refresh four times a day,
-- at the Elurikkus full-refresh times: 07:15, 11:30, 15:00, 21:00 Tallinn (EEST; UTC below, like the
-- m7-elurikkus jobs these stay on UTC). toenaosus-orchestrator body {"mode":"sightings"} runs config,
-- weather, eBird fetch, persist and notify only - no Sonnet, no toenaosus_raport row. The Sonnet raport
-- keeps m7-toenaosus-raport (10 15 * * *).
-- Created live via the Supabase connector after the P151 edge function was deployed; this file records it.
select cron.schedule('m7-toenaosus-sightings-am',   '15 4 * * *',    $$select public.m7_call_ef('toenaosus-orchestrator', '{"source":"schedule","mode":"sightings"}')$$);
select cron.schedule('m7-toenaosus-sightings-1130', '30 8 * * *',    $$select public.m7_call_ef('toenaosus-orchestrator', '{"source":"schedule","mode":"sightings"}')$$);
select cron.schedule('m7-toenaosus-sightings-pm',   '0 12,18 * * *', $$select public.m7_call_ef('toenaosus-orchestrator', '{"source":"schedule","mode":"sightings"}')$$);
