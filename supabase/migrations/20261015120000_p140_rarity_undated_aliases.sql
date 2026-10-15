-- P140: Haruldus for super/mega rarities without dated Elurikkus records, and alias names.
-- 1) elurikkus_rarity_undated: per species, the number of undated Estonian Elurikkus records
--    (mostly basis_of_record 'Literature'); filled once from elu_pgnet_history responses.
-- 2) get_species_rarity_records_v2(p_names): get_species_rarity_records over several Estonian
--    names (all names sharing one Latin name, e.g. Punasaba-kõnnuõgija / Punasaba-õgija).
--    v1 stays unchanged.

create table if not exists public.elurikkus_rarity_undated (
  species_name text primary key,
  sci          text,
  n            integer not null default 0,
  fetched_at   timestamptz not null default now()
);
alter table public.elurikkus_rarity_undated enable row level security;
drop policy if exists "anon read elurikkus_rarity_undated" on public.elurikkus_rarity_undated;
create policy "anon read elurikkus_rarity_undated" on public.elurikkus_rarity_undated
  for select to anon, authenticated using (true);
grant select on public.elurikkus_rarity_undated to anon, authenticated;

create or replace function public.get_species_rarity_records_v2(p_names text[])
 returns table(record_no integer, first_date date, last_date date, locality text, county text,
               lat double precision, lon double precision, n_obs integer)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  r record; i int; hit int; d_km double precision;
  c_first date[] := '{}'; c_last date[] := '{}'; c_lat float8[] := '{}'; c_lon float8[] := '{}';
  c_loc text[] := '{}'; c_cty text[] := '{}'; c_n int[] := '{}';
begin
  -- P140: as get_species_rarity_records (P121), over every name in p_names (max 5).
  if coalesce(array_length(p_names, 1), 0) = 0 or array_length(p_names, 1) > 5 then
    return;
  end if;
  if (select count(*) from public.elurikkus_observations o where o.species_name = any(p_names)) > 3000 then
    return; -- not a rarity; never cluster big species
  end if;
  for r in select o.observed_at d, o.lat la, o.lon lo, o.locality loc, o.county cty
           from public.elurikkus_observations o
           where o.species_name = any(p_names) and o.observed_at is not null
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
$function$;

grant execute on function public.get_species_rarity_records_v2(text[]) to anon, authenticated;

-- Fill (run once, by hand, not part of the migration):
--   1. select * from public.elu_pgnet_history(array[<= 25 super/mega Latin names>], 0);  -- per batch
--   2. after the responses land, upsert per species:
--      insert into public.elurikkus_rarity_undated (species_name, sci, n, fetched_at)
--      select <name>, <sci>, count(*), now() from net._http_response r,
--             jsonb_array_elements(r.content::jsonb->'results') x
--      where r.id = <request_id> and x->>'country' = 'Estonia'
--        and (x->>'taxon_name' = <sci> or x->>'taxon_name' like <sci> || ' %')
--        and not pg_input_is_valid(left(coalesce(x->>'event_date', ''), 10), 'date')
--      on conflict (species_name) do update set n = excluded.n, sci = excluded.sci, fetched_at = now();
