-- P126: full Elurikkus history for super/mega rarities.
-- elurikkus_observations only held data from about Oct 2023 (3-year backfill), and the
-- Estonian-name search misses taxa whose common_name_est is empty in Elurikkus
-- (e.g. Glareola pratincola). These two server-only functions fetch a species' whole
-- history by scientific name over pg_net (Elurikkus blocks the Edge IPs) and store the
-- dated rows from Estonia only (museum specimens from abroad and zoo birds are skipped).
-- Existing rows are never touched (on conflict (sub_id) do nothing).

create or replace function public.elu_pgnet_history(p_sci text[], p_offset int default 0)
returns table(sci text, request_id bigint)
language plpgsql
security definer
set search_path to 'public', 'net', 'extensions'
as $function$
begin
  if coalesce(array_length(p_sci, 1), 0) = 0 then return; end if;
  if array_length(p_sci, 1) > 25 then
    raise exception 'elu_pgnet_history: max 25 names per call';
  end if;
  return query
    select s,
           net.http_post(
             'https://elurikkus.ee/api/occurrences/search',
             body => jsonb_build_object(
               'q', '_text_:"' || s || '"',
               'facets', '[]'::jsonb,
               'pagination', jsonb_build_object(
                 'offset', greatest(coalesce(p_offset, 0), 0),
                 'limit', 500,
                 'order', jsonb_build_object('by', 'event_datetime_point', 'ascending', true)
               )
             ),
             headers => '{"Content-Type":"application/json"}'::jsonb,
             timeout_milliseconds => 30000
           )
    from unnest(p_sci) as s
    where s ~ '^[A-Z][a-z]+ [a-z-]+( [a-z-]+)?$';
end $function$;

create or replace function public.elu_history_ingest(p_request_id bigint, p_species_name text, p_taxon_names text[])
returns table(status int, total int, page_rows int, accepted int, inserted int)
language plpgsql
security definer
set search_path to 'public', 'net'
as $function$
declare
  v_status int; v_content text; v_json jsonb; v_ins int := 0; v_acc int := 0;
begin
  select r.status_code, r.content into v_status, v_content from net._http_response r where r.id = p_request_id;
  status := v_status;
  if v_status is distinct from 200 or v_content is null or left(v_content, 1) <> '{' then
    total := null; page_rows := 0; accepted := 0; inserted := 0; return next; return;
  end if;
  v_json := v_content::jsonb;
  total := (v_json->>'count')::int;
  page_rows := coalesce(jsonb_array_length(v_json->'results'), 0);

  with src as (
    select x
    from jsonb_array_elements(coalesce(v_json->'results', '[]'::jsonb)) x
    where (case when pg_input_is_valid(left(x->>'event_date', 10), 'date')
                then left(x->>'event_date', 10)::date end)
          between date '1800-01-01' and (now() at time zone 'Europe/Tallinn')::date
      and x->>'country' = 'Estonia'
      and coalesce(x->>'locality', '') !~* '(zoo|loomaaia)'
      and exists (select 1 from unnest(p_taxon_names) t
                  where x->>'taxon_name' = t or x->>'taxon_name' like t || ' %')
  ), ins as (
    insert into public.elurikkus_observations
      (sub_id, species_name, species_lat, observed_at, lat, lon, locality, county, observer, individual_count, behavior, fetched_at)
    select x->>'id',
           p_species_name,
           null,
           left(x->>'event_date', 10)::date,
           case when x->>'latitude' ~ '^-?\d+(\.\d+)?$' and (x->>'latitude')::float8 <> 0 then (x->>'latitude')::float8 end,
           case when x->>'longitude' ~ '^-?\d+(\.\d+)?$' and (x->>'longitude')::float8 <> 0 then (x->>'longitude')::float8 end,
           left(coalesce(nullif(x->>'locality', ''), nullif(x->>'municipality', ''), nullif(x->>'county', '')), 200),
           left(nullif(x->>'county', ''), 100),
           left(nullif((select string_agg(v, ', ') from jsonb_array_elements_text(case when jsonb_typeof(x->'recorded_by') = 'array' then x->'recorded_by' else '[]'::jsonb end) v), ''), 200),
           case when x->>'individual_count' ~ '^\d+$' then (x->>'individual_count')::int end,
           nullif(x->>'behavior', ''),
           now()
    from src
    where x->>'id' ~ '^\d+$'
    on conflict (sub_id) do nothing
    returning 1
  )
  select (select count(*) from src), (select count(*) from ins) into v_acc, v_ins;
  accepted := v_acc; inserted := v_ins;
  return next;
end $function$;

revoke all on function public.elu_pgnet_history(text[], int) from public, anon, authenticated;
revoke all on function public.elu_history_ingest(bigint, text, text[]) from public, anon, authenticated;
