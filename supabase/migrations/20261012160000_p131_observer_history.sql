-- P131: the viewer's own latest Elurikkus sighting for EVERY species ("Sinu viimane vaatlus").
-- elurikkus_observations holds only part of a person's records (full history only for rarities),
-- so the observer's whole Elurikkus history is fetched by name over pg_net (Elurikkus blocks the
-- Edge IPs and browser CORS) into elurikkus_observer_obs, at most once per 6 h per name and at most
-- 30 new names per hour. get_observer_latest_obs_v2 ingests finished pages lazily and answers with
-- state 'ok' (row), 'none' (history loaded, no record of this species) or 'loading'.
-- P131b: exact observer names only; Estonian name decides the species (scientific name only as a
-- fallback for records without one).

create table if not exists public.elurikkus_observer_obs (
  observer text not null,               -- lower(btrim(name))
  sub_id text not null,
  taxon_name text,
  common_name_est text,
  observed_at date,
  locality text,
  county text,
  individual_count int,
  fetched_at timestamptz not null default now(),
  primary key (observer, sub_id)
);
alter table public.elurikkus_observer_obs enable row level security;

create table if not exists public.elurikkus_observer_fetch (
  observer text primary key,            -- lower(btrim(name))
  pages jsonb not null default '[]'::jsonb,  -- [{"offset":0,"rid":123,"done":false}]
  total int,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.elurikkus_observer_fetch enable row level security;

create or replace function public._elu_observer_page(p_name text, p_offset int)
returns bigint
language sql
security definer
set search_path to 'public', 'net', 'extensions'
as $function$
  select net.http_post(
    'https://elurikkus.ee/api/occurrences/search',
    body => jsonb_build_object(
      'q', 'recorded_by:"' || p_name || '"',
      'facets', '[]'::jsonb,
      'pagination', jsonb_build_object('offset', p_offset, 'limit', 500,
        'order', jsonb_build_object('by', 'event_datetime_point', 'ascending', false))
    ),
    headers => '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds => 30000
  )
$function$;

create or replace function public.get_observer_latest_obs_v2(p_species text, p_sci text, p_observer text)
returns table(state text, observed_at date, locality text, county text, individual_count int)
language plpgsql
volatile
security definer
set search_path to 'public', 'net', 'extensions'
as $function$
declare
  v_name text := btrim(coalesce(p_observer, ''));
  v_key text := lower(btrim(coalesce(p_observer, '')));
  f public.elurikkus_observer_fetch%rowtype;
  pg jsonb; v_pages jsonb := '[]'::jsonb; v_status int; v_content text; v_json jsonb;
  v_pending boolean := false; v_total int; v_off int;
  r record;
begin
  if v_name !~ '^[[:alpha:]][[:alpha:] .''-]{3,78}[[:alpha:].]$' then
    state := 'invalid'; return next; return;
  end if;

  select * into f from public.elurikkus_observer_fetch where observer = v_key for update;

  -- start (or refresh after 6 h) the history fetch
  if not found or (f.completed_at is not null and f.requested_at < now() - interval '6 hours') then
    if (select count(*) from public.elurikkus_observer_fetch x where x.requested_at > now() - interval '1 hour') < 30 then
      insert into public.elurikkus_observer_fetch as t (observer, pages, total, requested_at, completed_at)
      values (v_key, jsonb_build_array(jsonb_build_object('offset', 0, 'rid', public._elu_observer_page(v_name, 0), 'done', false)), null, now(), null)
      on conflict (observer) do update set pages = excluded.pages, total = null, requested_at = now(), completed_at = null;
      select * into f from public.elurikkus_observer_fetch where observer = v_key;
    end if;
  end if;

  -- ingest finished pages
  if found and f.completed_at is null then
    v_total := f.total;
    for pg in select * from jsonb_array_elements(f.pages) loop
      if (pg->>'done')::boolean then v_pages := v_pages || pg; continue; end if;
      select hr.status_code, hr.content into v_status, v_content from net._http_response hr where hr.id = (pg->>'rid')::bigint;
      if v_status is null then
        if f.requested_at < now() - interval '2 minutes' then v_pages := v_pages || jsonb_set(pg, '{done}', 'true'::jsonb);
        else v_pending := true; v_pages := v_pages || pg; end if;
        continue;
      end if;
      if v_status = 200 and left(v_content, 1) = '{' then
        v_json := v_content::jsonb;
        v_total := coalesce((v_json->>'count')::int, v_total);
        insert into public.elurikkus_observer_obs as o (observer, sub_id, taxon_name, common_name_est, observed_at, locality, county, individual_count, fetched_at)
        select v_key, x->>'id', x->>'taxon_name', nullif(x->>'common_name_est', ''),
               case when pg_input_is_valid(left(x->>'event_date', 10), 'date') then left(x->>'event_date', 10)::date end,
               left(coalesce(nullif(x->>'locality', ''), nullif(x->>'municipality', ''), nullif(x->>'county', '')), 200),
               left(nullif(x->>'county', ''), 100),
               case when x->>'individual_count' ~ '^\d+$' then (x->>'individual_count')::int end,
               now()
        from jsonb_array_elements(coalesce(v_json->'results', '[]'::jsonb)) x
        where x->>'id' ~ '^\d+$'
          -- P131b: the Elurikkus phrase query also matches partial names; keep exact observers only
          and exists (select 1 from jsonb_array_elements_text(case when jsonb_typeof(x->'recorded_by') = 'array'
                         then x->'recorded_by' else '[]'::jsonb end) rb where lower(btrim(rb)) = v_key)
        on conflict (observer, sub_id) do update set taxon_name = excluded.taxon_name, common_name_est = excluded.common_name_est,
          observed_at = excluded.observed_at, locality = excluded.locality, county = excluded.county,
          individual_count = excluded.individual_count, fetched_at = excluded.fetched_at;
        -- first page tells the total: queue the remaining pages (max 10 pages = 5000 records)
        if (pg->>'offset')::int = 0 and v_total > 500 then
          v_off := 500;
          while v_off < least(v_total, 5000) loop
            v_pages := v_pages || jsonb_build_object('offset', v_off, 'rid', public._elu_observer_page(v_name, v_off), 'done', false);
            v_pending := true;
            v_off := v_off + 500;
          end loop;
        end if;
      end if;
      v_pages := v_pages || jsonb_set(pg, '{done}', 'true'::jsonb);
    end loop;
    update public.elurikkus_observer_fetch
      set pages = v_pages, total = v_total, completed_at = case when v_pending then null else now() end
      where observer = v_key;
    select * into f from public.elurikkus_observer_fetch where observer = v_key;
  end if;

  -- answer: newest dated record of this species (own history, else the shared table)
  for r in
    select * from (
      select o.observed_at, o.locality, o.county, o.individual_count
      from public.elurikkus_observer_obs o
      where o.observer = v_key and o.observed_at is not null
        -- P131b: Estonian name decides; the scientific name only for records without one
        -- (Elurikkus 'vares' = Corvus corone s.l. must not count as Mustvares)
        and (lower(o.common_name_est) = lower(p_species)
             or (o.common_name_est is null and p_sci is not null and p_sci <> ''
                 and (o.taxon_name = p_sci or o.taxon_name like p_sci || ' %')))
      union all
      select e.observed_at, e.locality, e.county, e.individual_count
      from public.elurikkus_observations e
      where e.species_name = p_species
        and e.observer ~* ('(^|,\s*)' || regexp_replace(v_name, '([.])', '\\\1', 'g') || '\s*(,|$)')
    ) u
    order by u.observed_at desc nulls last
    limit 1
  loop
    state := 'ok'; observed_at := r.observed_at; locality := r.locality; county := r.county; individual_count := r.individual_count;
    return next; return;
  end loop;

  state := case when f.observer is not null and f.completed_at is not null then 'none' else 'loading' end;
  return next;
end $function$;

revoke all on function public._elu_observer_page(text, int) from public, anon, authenticated;
revoke all on function public.get_observer_latest_obs_v2(text, text, text) from public;
grant execute on function public.get_observer_latest_obs_v2(text, text, text) to anon, authenticated;
