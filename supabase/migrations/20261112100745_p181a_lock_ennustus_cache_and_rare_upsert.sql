-- P181a: close two anon write paths.
-- 1) ennustus_cache: only compute-ennustus (service_role) writes it.
drop policy if exists "ennustus_cache write for all" on public.ennustus_cache;
revoke insert, update, delete, truncate on public.ennustus_cache from anon, authenticated;
-- 2) bulk_upsert_ebird_rare_observations: only insert-ebird-rare-observations (service_role) calls it.
revoke execute on function public.bulk_upsert_ebird_rare_observations(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.bulk_upsert_ebird_rare_observations(jsonb, jsonb) to service_role;