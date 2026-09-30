-- P89b 2026-09-30: one POST to the Elurikkus occurrence API for the newest bird records
-- (class:Aves, event_date since yesterday Europe/Tallinn, newest first, max 200) via pg_net
-- from the DB host (Edge IPs are blocked by elurikkus.ee). URL and body are fixed server-side.
-- Read the response with public.elu_pgnet_collect(ARRAY[id]).
create or replace function public.elu_pgnet_recent_feed()
returns bigint
language plpgsql security definer
set search_path = public, net, extensions
as $$
declare
  v_since date := ((now() at time zone 'Europe/Tallinn')::date - 1);
begin
  return net.http_post(
    'https://elurikkus.ee/api/occurrences/search',
    body => jsonb_build_object(
      'q', 'class:Aves AND event_date:[' || to_char(v_since, 'YYYY-MM-DD') || ' TO *]',
      'facets', '[]'::jsonb,
      'pagination', jsonb_build_object(
        'offset', 0,
        'limit', 200,
        'order', jsonb_build_object('by', 'event_datetime_point', 'ascending', false)
      )
    ),
    headers => '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds => 20000
  );
end $$;

revoke all on function public.elu_pgnet_recent_feed() from public, anon, authenticated;
grant execute on function public.elu_pgnet_recent_feed() to service_role;
