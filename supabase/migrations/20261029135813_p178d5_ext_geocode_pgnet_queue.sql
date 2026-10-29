-- p178d5_ext_geocode_pgnet_queue.sql
-- P178d5: Nominatim returns 403 to Supabase Edge IPs but answers pg_net (29 Oct 2026).
-- ext-rare-refresh now only QUEUES unknown places (lat null, retry_after null).
-- public.ext_geocode_step() runs from pg_cron every 5 minutes:
--   1) collects finished pg_net replies into the cache,
--   2) sends at most ONE new Nominatim request (OSM policy: max 1 req/s, own UA).
-- Pending row  = lat null, retry_after null.  Miss = lat null, retry_after set.

alter table public.ext_place_geocode
  add column if not exists pgnet_request_id bigint,
  add column if not exists requested_at     timestamptz;

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
  v_first     jsonb;
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

    if v_resp.status_code = 200 and v_resp.content is not null
       and jsonb_typeof(v_resp.content::jsonb) = 'array'
       and jsonb_array_length(v_resp.content::jsonb) > 0 then
      v_first := v_resp.content::jsonb -> 0;
      update public.ext_place_geocode
         set lat = (v_first->>'lat')::double precision,
             lng = (v_first->>'lon')::double precision,
             display_name = v_first->>'display_name',
             osm_type = v_first->>'osm_type',
             osm_id = nullif(v_first->>'osm_id','')::bigint,
             retry_after = null,
             looked_up_at = now(),
             pgnet_request_id = null, requested_at = null
       where country_code = v_row.country_code and query = v_row.query;
    elsif v_resp.status_code = 200 then
      -- empty result: real miss, retry in 30 days
      update public.ext_place_geocode
         set retry_after = now() + interval '30 days', looked_up_at = now(),
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
        jsonb_build_object('format','jsonv2','limit','1',
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

-- Schedule (needs Kristian's go; cron is on the approval list):
select cron.schedule('m7-ext-geocode-step', '*/5 * * * *', $$select public.ext_geocode_step()$$);
