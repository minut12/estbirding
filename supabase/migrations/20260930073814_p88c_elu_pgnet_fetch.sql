-- P88c 2026-09-30: fetch Elurikkus search pages from the DB host via pg_net.
-- elurikkus.ee has been blocking the Supabase Edge Function IPs since 2026-09-29 (HTTP 500 error page);
-- the DB host is not blocked. URL is fixed server-side; callers pass species names only.
create or replace function public.elu_pgnet_request(p_names text[])
returns table(species_name text, request_id bigint)
language plpgsql security definer
set search_path = public, net, extensions
as $$
begin
  if coalesce(array_length(p_names, 1), 0) = 0 then return; end if;
  if array_length(p_names, 1) > 25 then
    raise exception 'elu_pgnet_request: max 25 names per call';
  end if;
  return query
    select n,
           net.http_get('https://elurikkus.ee/app/occurrences/search',
                        params => jsonb_build_object('text', n),
                        timeout_milliseconds => 20000)
    from unnest(p_names) as n
    where n is not null and length(n) between 1 and 80;
end $$;

create or replace function public.elu_pgnet_collect(p_ids bigint[])
returns table(request_id bigint, status_code int, timed_out boolean, error_msg text, content text)
language sql security definer
set search_path = public, net
as $$
  select r.id, r.status_code, r.timed_out, r.error_msg, r.content
  from net._http_response r
  where r.id = any(p_ids)
$$;

revoke all on function public.elu_pgnet_request(text[])   from public, anon, authenticated;
revoke all on function public.elu_pgnet_collect(bigint[]) from public, anon, authenticated;
grant execute on function public.elu_pgnet_request(text[])   to service_role;
grant execute on function public.elu_pgnet_collect(bigint[]) to service_role;
