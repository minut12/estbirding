-- 20261011100000_p121_rarity_records_xc.sql
-- P121: (1) species_info.xc_recordings - one song + one call per species from xeno-canto
-- (filled by species-info-save action=xc). (2) get_species_rarity_records(p_species):
-- Estonian records of a rare species from elurikkus_observations; rows within 5 km and
-- 7 days of a record's rows are the same record. Used for "Eesti N. vaatlus" on SR/MR
-- cards. Applied live 2026-10-11 via connector.

alter table public.species_info add column if not exists xc_recordings jsonb;

create or replace function public.get_species_rarity_records(p_species text)
returns table(record_no int, first_date date, last_date date, locality text, county text, lat double precision, lon double precision, n_obs int)
language plpgsql stable security definer set search_path = public as $fn$
#variable_conflict use_column
declare
  r record; i int; hit int; d_km double precision;
  c_first date[] := '{}'; c_last date[] := '{}'; c_lat float8[] := '{}'; c_lon float8[] := '{}';
  c_loc text[] := '{}'; c_cty text[] := '{}'; c_n int[] := '{}';
begin
  -- P121: Estonian records of a rare species from elurikkus_observations.
  -- Rows of one species within 5 km and 7 days of a record's rows are the same record.
  -- Exact species_name match (idx_elurikkus_obs_species_observed).
  if (select count(*) from public.elurikkus_observations o where o.species_name = p_species) > 3000 then
    return; -- not a rarity; never cluster big species
  end if;
  for r in select o.observed_at d, o.lat la, o.lon lo, o.locality loc, o.county cty
           from public.elurikkus_observations o
           where o.species_name = p_species and o.observed_at is not null
           order by o.observed_at, o.lat nulls last loop
    hit := null;
    for i in 1..coalesce(array_length(c_first, 1), 0) loop
      if r.d - c_last[i] <= 7 then
        if r.la is null or c_lat[i] is null then d_km := 0;
        else d_km := 6371 * 2 * asin(sqrt(power(sin(radians(r.la - c_lat[i]) / 2), 2)
                     + cos(radians(c_lat[i])) * cos(radians(r.la)) * power(sin(radians(r.lo - c_lon[i]) / 2), 2)));
        end if;
        if d_km <= 5 then hit := i; exit; end if;
      end if;
    end loop;
    if hit is null then
      c_first := array_append(c_first, r.d); c_last := array_append(c_last, r.d);
      c_lat := array_append(c_lat, r.la); c_lon := array_append(c_lon, r.lo);
      c_loc := array_append(c_loc, r.loc); c_cty := array_append(c_cty, r.cty); c_n := array_append(c_n, 1);
    else
      c_last[hit] := greatest(c_last[hit], r.d); c_n[hit] := c_n[hit] + 1;
      if c_lat[hit] is null then c_lat[hit] := r.la; c_lon[hit] := r.lo; end if;
    end if;
  end loop;
  for i in 1..coalesce(array_length(c_first, 1), 0) loop
    record_no := i; first_date := c_first[i]; last_date := c_last[i]; locality := c_loc[i]; county := c_cty[i];
    lat := c_lat[i]; lon := c_lon[i]; n_obs := c_n[i];
    return next;
  end loop;
end
$fn$;

revoke all on function public.get_species_rarity_records(text) from public;
grant execute on function public.get_species_rarity_records(text) to anon, authenticated;
