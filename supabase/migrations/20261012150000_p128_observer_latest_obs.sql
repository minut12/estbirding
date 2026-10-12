-- P128: the viewer's own latest Elurikkus sighting of a species, for the species info modal.
-- The observer name comes from Seaded (stored only on the device). Returns date, place and
-- count only (no coordinates). Name must be at least 5 characters; LIKE wildcards are escaped.
create or replace function public.get_observer_latest_obs(p_species text, p_observer text)
returns table(observed_at date, locality text, county text, individual_count int)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select o.observed_at, o.locality, o.county, o.individual_count
  from public.elurikkus_observations o
  where o.species_name = p_species
    and length(btrim(coalesce(p_observer, ''))) >= 5
    and o.observer ilike '%' || replace(replace(replace(btrim(p_observer), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by o.observed_at desc nulls last
  limit 1
$function$;

revoke all on function public.get_observer_latest_obs(text, text) from public;
grant execute on function public.get_observer_latest_obs(text, text) to anon, authenticated;
