-- p178d8_ext_geocode_prefer_boundary.sql
-- P178d8: Nominatim's top hit for "<District> savivaldybe" can be a street named after the
-- district (29 Oct 2026: "Alytaus g." and "Rokiskio g." near Klaipeda, ~280 km off).
-- Ask for 5 results; take the first administrative boundary, else the first non-highway
-- result; only highways -> miss (no pin is better than a wrong pin).
-- Also re-queues the two wrong cache rows.

create or replace function public.ext_geocode_step()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_collected int := 0;
  v_sent      int := 0;
  v_row       record;
  v_resp      record;
  v_pick      jsonb;
  v_id        bigint;
begin
  -- 1) collect replies of earlier requests
  for v_row in
    select country_code, query, pgnet_request_id, requested_at
    from public.ext_place_geocode
    where pgnet_request_id is not null
  loop
    select status_code, content, timed_out, error_msg
      into v_resp
      from net._http_response where id = v_row.pgnet_request_id;

    if not found then
      -- reply not in yet; give up after 1 h (pg_net keeps replies ~6 h)
      if v_row.requested_at < now() - interval '1 hour' then
        update public.ext_place_geocode
           set pgnet_request_id = null, requested_at = null
         where country_code = v_row.country_code and query = v_row.query;
      end if;
      continue;
    end if;

    v_pick := null;
    if v_resp.status_code = 200 and v_resp.content is not null
       and jsonb_typeof(v_resp.content::jsonb) = 'array' then
      select e into v_pick
        from jsonb_array_elements(v_resp.content::jsonb) with ordinality as t(e, i)
       where coalesce(e->>'category', '') <> 'highway'
       order by (coalesce(e->>'category', '') = 'boundary') desc, i
       limit 1;
    end if;

    if v_pick is not null then
      update public.ext_place_geocode
         set lat = (v_pick->>'lat')::double precision,
             lng = (v_pick->>'lon')::double precision,
             display_name = v_pick->>'display_name',
             osm_type = v_pick->>'osm_type',
             osm_id = nullif(v_pick->>'osm_id','')::bigint,
             retry_after = null,
             looked_up_at = now(),
             pgnet_request_id = null, requested_at = null
       where country_code = v_row.country_code and query = v_row.query;
    elsif v_resp.status_code = 200 then
      -- no usable result (empty or only streets): miss, retry in 30 days
      update public.ext_place_geocode
         set lat = null, lng = null, display_name = null, osm_type = null, osm_id = null,
             retry_after = now() + interval '30 days', looked_up_at = now(),
             pgnet_request_id = null, requested_at = null
       where country_code = v_row.country_code and query = v_row.query;
    else
      -- HTTP error / timeout: retry tomorrow, never hammer
      update public.ext_place_geocode
         set retry_after = now() + interval '1 day', looked_up_at = now(),
             pgnet_request_id = null, requested_at = null
       where country_code = v_row.country_code and query = v_row.query;
    end if;
    v_collected := v_collected + 1;
  end loop;

  -- 2) send at most one new request, only if nothing is in flight
  if not exists (select 1 from public.ext_place_geocode where pgnet_request_id is not null) then
    select country_code, query into v_row
      from public.ext_place_geocode
     where lat is null
       and pgnet_request_id is null
       and (retry_after is null or retry_after < now())
     order by looked_up_at nulls first, query
     limit 1;
    if found then
      v_id := net.http_get(
        'https://nominatim.openstreetmap.org/search',
        jsonb_build_object('format','jsonv2','limit','5',
                           'countrycodes', lower(v_row.country_code), 'q', v_row.query),
        '{"User-Agent":"EstBirds/1.0 (+https://estbirds.netlify.app)","Referer":"https://estbirds.netlify.app/"}'::jsonb,
        15000);
      update public.ext_place_geocode
         set pgnet_request_id = v_id, requested_at = now()
       where country_code = v_row.country_code and query = v_row.query;
      v_sent := 1;
    end if;
  end if;

  return jsonb_build_object('collected', v_collected, 'sent', v_sent);
end;
$$;

revoke all on function public.ext_geocode_step() from public, anon, authenticated;

-- Re-queue cache rows whose stored hit is a street.
update public.ext_place_geocode
   set lat = null, lng = null, display_name = null, osm_type = null, osm_id = null,
       retry_after = null, looked_up_at = now()   -- column is NOT NULL
 where country_code = 'LT'
   and query in ('Alytaus savivaldybe', 'Rokiskio savivaldybe');
