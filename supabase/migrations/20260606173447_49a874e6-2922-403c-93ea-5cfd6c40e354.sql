create or replace function public.bulk_upsert_ebird_rare_observations(
  p_observations jsonb,
  p_wind_corridor jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted int := 0;
  v_updated  int := 0;
  v_total    int := coalesce(jsonb_array_length(p_observations), 0);
begin
  with parsed as (
    select
      nullif(o->>'ebird_sub_id','')                          as ebird_sub_id,
      nullif(o->>'species_code','')                          as species_code,
      o->>'species_lat_name'                                 as species_lat_name,
      o->>'species_et_name'                                  as species_et_name,
      o->>'rarity_level'                                     as rarity_level,
      o->>'country_code'                                     as country_code,
      o->>'region'                                           as region,
      o->>'location'                                         as location,
      nullif(o->>'lat','')::double precision                 as lat,
      nullif(o->>'lng','')::double precision                 as lng,
      nullif(o->>'distance_to_ee_km','')::double precision   as distance_to_ee_km,
      nullif(o->>'obs_date','')::timestamptz                 as obs_date,
      nullif(o->>'obs_count','')::int                        as obs_count,
      case when jsonb_typeof(o->'observer_names') = 'array'
           then array(select jsonb_array_elements_text(o->'observer_names')) end as observer_names,
      case when jsonb_typeof(o->'raw_observation') = 'object'
           then o->'raw_observation' end                     as raw_observation
    from jsonb_array_elements(coalesce(p_observations,'[]'::jsonb)) as o
  ),
  valid as (
    select distinct on (ebird_sub_id, species_code) *
    from parsed
    where ebird_sub_id is not null and species_code is not null and obs_date is not null
    order by ebird_sub_id, species_code, obs_date desc nulls last
  ),
  ups as (
    insert into ebird_rare_observations as t (
      ebird_sub_id, species_code, species_lat_name, species_et_name, rarity_level,
      country_code, region, location, lat, lng, distance_to_ee_km,
      obs_date, obs_count, observer_names, wind_corridor_at_time, raw_observation,
      first_seen_at, last_seen_at
    )
    select
      v.ebird_sub_id, v.species_code, v.species_lat_name, v.species_et_name, v.rarity_level,
      v.country_code, v.region, v.location, v.lat, v.lng, v.distance_to_ee_km,
      v.obs_date, v.obs_count, v.observer_names, p_wind_corridor, v.raw_observation,
      now(), now()
    from valid v
    on conflict (ebird_sub_id, species_code) do update set
      last_seen_at          = now(),
      wind_corridor_at_time = excluded.wind_corridor_at_time,
      species_lat_name      = coalesce(t.species_lat_name, excluded.species_lat_name),
      species_et_name       = coalesce(t.species_et_name, excluded.species_et_name),
      rarity_level          = coalesce(t.rarity_level, excluded.rarity_level),
      country_code          = coalesce(t.country_code, excluded.country_code),
      region                = coalesce(t.region, excluded.region),
      location              = coalesce(t.location, excluded.location),
      lat                   = coalesce(t.lat, excluded.lat),
      lng                   = coalesce(t.lng, excluded.lng),
      distance_to_ee_km     = coalesce(t.distance_to_ee_km, excluded.distance_to_ee_km),
      raw_observation       = coalesce(t.raw_observation, excluded.raw_observation)
    returning (xmax = 0) as was_insert
  )
  select count(*) filter (where was_insert), count(*) filter (where not was_insert)
  into v_inserted, v_updated
  from ups;

  return jsonb_build_object('ok', true, 'inserted', v_inserted,
                            'updated', v_updated, 'skipped', v_total - (v_inserted + v_updated));
end;
$$;