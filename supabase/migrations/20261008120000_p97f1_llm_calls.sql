-- p97f1_llm_calls.sql
-- P97f1: own AI-call log for Seaded > Diagnostika (Claude / Gemini status), plus alert dedupe state.
-- Anthropic exposes no prepaid-balance API, so status comes from our own calls.
-- Written only by Edge Functions (service role, via _shared/llm.ts). Admins read via admin_llm_status().

create table if not exists public.llm_calls (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  source text not null default 'unknown',
  provider text not null check (provider in ('anthropic', 'gemini')),
  model text,
  ok boolean not null,
  http_status integer,
  error_class text check (error_class in ('credit', 'rate_limit', 'overload', 'auth', 'timeout', 'network', 'bad_request', 'empty', 'other')),
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  fallback boolean not null default false
);
create index if not exists llm_calls_created_at_idx on public.llm_calls (created_at desc);
create index if not exists llm_calls_provider_created_at_idx on public.llm_calls (provider, created_at desc);
alter table public.llm_calls enable row level security;
revoke all on public.llm_calls from anon, authenticated;

create table if not exists public.llm_alert_state (
  key text primary key,
  last_sent_at timestamptz not null
);
alter table public.llm_alert_state enable row level security;
revoke all on public.llm_alert_state from anon, authenticated;

-- Admin-only summary for the Diagnostika card.
create or replace function public.admin_llm_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
      from (values ('anthropic', 1), ('gemini', 2)) as pr(provider, ord)
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
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_llm_status() from public, anon;
grant execute on function public.admin_llm_status() to authenticated;

-- Retention: Edge Functions call this now and then (service role only).
create or replace function public.llm_calls_prune()
returns integer
language sql
security definer
set search_path = public
as $$
  with d as (
    delete from public.llm_calls where created_at < now() - interval '30 days' returning 1
  )
  select count(*)::integer from d;
$$;

revoke all on function public.llm_calls_prune() from public, anon, authenticated;
grant execute on function public.llm_calls_prune() to service_role;
