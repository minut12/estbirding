-- 20261009130000_p108_llm_mistral.sql
-- P108: Mistral (free tier) as the third LLM provider after Claude and Gemini.
-- llm_calls accepts provider 'mistral'; admin_llm_status() reports it as a third row.
alter table public.llm_calls drop constraint if exists llm_calls_provider_check;
alter table public.llm_calls add constraint llm_calls_provider_check
  check (provider = any (array['anthropic'::text, 'gemini'::text, 'mistral'::text]));

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
    )
  ) into v_result;

  return v_result;
end;
$function$;
