-- P181d: LLM chain circuit breaker state + model visibility in the admin view.
-- No new tables and no new writes: everything is derived from public.llm_calls
-- (one row per provider attempt, P97f2). The table is small (30-day prune,
-- ~630 rows on 2026-11-12) and llm_calls_created_at_idx already serves the
-- 48 h range, so no new index is needed.
--
-- public.llm_route_state(): one row per provider/model seen in the last 48 h.
--   skip_until  = last "trip" error + 6 h, while that is in the future and no
--                 success came after the error (a later success closes the breaker).
--   trip errors = error_class credit | auth | rate_limit | overload, plus
--                 timeout for the backup providers (a per-model time cap is
--                 treated like a 503; a Claude timeout is the caller's own).
--   calls_48h / ok_48h feed the success-rate ordering in _shared/llmRoute.ts.
-- Read by _shared/llm.ts with the service role (cached 60 s per isolate).

create or replace function public.llm_route_state()
returns table (
  provider text,
  model text,
  last_ok_at timestamptz,
  last_error_at timestamptz,
  skip_reason text,
  skip_until timestamptz,
  calls_48h integer,
  ok_48h integer
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with recent as (
    select
      c.provider,
      coalesce(c.model, '') as model,
      c.created_at,
      c.ok,
      c.error_class,
      (not c.ok and (
        c.error_class in ('credit', 'auth', 'rate_limit', 'overload')
        or (c.error_class = 'timeout' and c.provider <> 'anthropic')
      )) as trip
    from public.llm_calls c
    where c.created_at > now() - interval '48 hours'
  ),
  agg as (
    select
      r.provider,
      r.model,
      max(r.created_at) filter (where r.ok) as last_ok_at,
      max(r.created_at) filter (where not r.ok) as last_error_at,
      max(r.created_at) filter (where r.trip) as last_trip_at,
      (array_agg(r.error_class order by r.created_at desc) filter (where r.trip))[1] as trip_class,
      count(*)::integer as calls_48h,
      (count(*) filter (where r.ok))::integer as ok_48h
    from recent r
    group by r.provider, r.model
  )
  select
    a.provider,
    a.model,
    a.last_ok_at,
    a.last_error_at,
    case when s.open then a.trip_class end as skip_reason,
    case when s.open then a.last_trip_at + interval '6 hours' end as skip_until,
    a.calls_48h,
    a.ok_48h
  from agg a
  cross join lateral (
    select coalesce(
      a.last_trip_at > now() - interval '6 hours'
        and (a.last_ok_at is null or a.last_ok_at < a.last_trip_at),
      false
    ) as open
  ) s
  order by a.provider, a.model;
$$;

revoke all on function public.llm_route_state() from public, anon, authenticated;
grant execute on function public.llm_route_state() to service_role;

-- admin_llm_status(): unchanged body (admin assert kept) plus two keys:
--   'sources' - per llm_calls.source the last successful provider/model and time
--   'skipped' - models currently in their skip window, with skip_until
create or replace function public.admin_llm_status()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
begin
  perform public.events_admin_assert_admin();

  select jsonb_build_object(
    'generated_at', now(),
    'providers', (
      select jsonb_agg(
        jsonb_build_object(
          'provider', pr.provider,
          'last_ok_at', (select max(a.created_at) from public.llm_calls a where a.provider = pr.provider and a.ok),
          'last_error_at', (select max(a.created_at) from public.llm_calls a where a.provider = pr.provider and not a.ok),
          'last_error_class', (select a.error_class from public.llm_calls a where a.provider = pr.provider and not a.ok order by a.created_at desc limit 1),
          'last_error_status', (select a.http_status from public.llm_calls a where a.provider = pr.provider and not a.ok order by a.created_at desc limit 1),
          'calls_24h', (select count(*) from public.llm_calls a where a.provider = pr.provider and a.created_at > now() - interval '24 hours'),
          'errors_24h', (select count(*) from public.llm_calls a where a.provider = pr.provider and not a.ok and a.created_at > now() - interval '24 hours'),
          'tokens_in_24h', (select coalesce(sum(a.input_tokens), 0) from public.llm_calls a where a.provider = pr.provider and a.ok and a.created_at > now() - interval '24 hours'),
          'tokens_out_24h', (select coalesce(sum(a.output_tokens), 0) from public.llm_calls a where a.provider = pr.provider and a.ok and a.created_at > now() - interval '24 hours'),
          'calls_7d', (select count(*) from public.llm_calls a where a.provider = pr.provider and a.created_at > now() - interval '7 days'),
          'errors_7d', (select count(*) from public.llm_calls a where a.provider = pr.provider and not a.ok and a.created_at > now() - interval '7 days')
        )
        order by pr.ord
      )
      from (values ('anthropic', 1), ('gemini', 2), ('mistral', 3)) as pr(provider, ord)
    ),
    'fallbacks_24h', (select count(*) from public.llm_calls a where a.fallback and a.ok and a.created_at > now() - interval '24 hours'),
    'anthropic_credit_out_since', (
      select min(a.created_at)
      from public.llm_calls a
      where a.provider = 'anthropic'
        and a.error_class = 'credit'
        and a.created_at > coalesce(
          (select max(b.created_at) from public.llm_calls b where b.provider = 'anthropic' and b.ok),
          '-infinity'::timestamptz
        )
    ),
    'sources', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'source', s.source,
          'provider', s.provider,
          'model', s.model,
          'last_ok_at', s.created_at
        )
        order by s.created_at desc
      )
      from (
        select distinct on (a.source) a.source, a.provider, a.model, a.created_at
        from public.llm_calls a
        where a.ok
        order by a.source, a.created_at desc
      ) s
    ), '[]'::jsonb),
    'skipped', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'provider', r.provider,
          'model', r.model,
          'reason', r.skip_reason,
          'skip_until', r.skip_until
        )
        order by r.provider, r.model
      )
      from public.llm_route_state() r
      where r.skip_until > now()
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;