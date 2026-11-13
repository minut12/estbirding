-- p181f_client_errors.sql
-- P181f: browser error log for the React app and the three map iframes (linnuliigid, europe, rariliin).
-- Written only through public.log_client_error() (SECURITY DEFINER, anon + authenticated may execute);
-- the table itself has RLS on and no policies, so anon/authenticated cannot read or write it directly.
-- Admins read via public.admin_client_errors(p_days).
-- No edge function: a direct RPC is simpler and the iframes already hold the publishable key.

create table if not exists public.client_errors (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  surface text not null check (surface in ('app', 'linnuliigid', 'europe', 'rariliin')),
  message text,
  stack text,
  url text,
  build text,
  user_agent text,
  count integer not null default 1,
  fingerprint text
);
create index if not exists client_errors_created_at_idx on public.client_errors (created_at desc);
create index if not exists client_errors_fingerprint_created_at_idx on public.client_errors (fingerprint, created_at desc);
alter table public.client_errors enable row level security;
revoke all on public.client_errors from anon, authenticated;
revoke all on sequence public.client_errors_id_seq from anon, authenticated;

-- Fire-and-forget logger. Always returns void; invalid or over-limit reports are dropped silently.
create or replace function public.log_client_error(
  p_surface text,
  p_message text,
  p_stack text,
  p_url text,
  p_build text,
  p_user_agent text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_surface text := lower(btrim(coalesce(p_surface, '')));
  v_message text := left(coalesce(p_message, ''), 500);
  v_stack text := left(p_stack, 4000);
  v_frame text;
  v_fp text;
  v_id bigint;
begin
  if v_surface not in ('app', 'linnuliigid', 'europe', 'rariliin') then
    return;
  end if;
  if v_message = '' and coalesce(v_stack, '') = '' then
    return;
  end if;

  -- First stack frame: Chrome "    at fn (url:l:c)" or Firefox/Safari "fn@url:l:c"; else first non-empty line.
  select btrim(l.line) into v_frame
  from regexp_split_to_table(coalesce(v_stack, ''), E'\n') with ordinality as l(line, ord)
  where l.line ~ '(^\s*at\s|@)'
  order by l.ord
  limit 1;
  if v_frame is null then
    select btrim(l.line) into v_frame
    from regexp_split_to_table(coalesce(v_stack, ''), E'\n') with ordinality as l(line, ord)
    where btrim(l.line) <> ''
    order by l.ord
    limit 1;
  end if;
  v_fp := md5(v_surface || '|' || v_message || '|' || coalesce(v_frame, ''));

  -- Dedupe: same fingerprint within 10 minutes bumps count.
  update public.client_errors e
  set count = e.count + 1
  where e.id = (
    select c.id from public.client_errors c
    where c.fingerprint = v_fp and c.created_at > now() - interval '10 minutes'
    order by c.created_at desc
    limit 1
  )
  returning e.id into v_id;
  if v_id is not null then
    return;
  end if;

  -- Global rate limit: at most 200 new rows per rolling hour.
  if (select count(*) from public.client_errors c where c.created_at > now() - interval '1 hour') >= 200 then
    return;
  end if;

  -- Retention: keep 30 days.
  delete from public.client_errors c where c.created_at < now() - interval '30 days';

  insert into public.client_errors (surface, message, stack, url, build, user_agent, fingerprint)
  values (
    v_surface,
    v_message,
    v_stack,
    left(p_url, 500),
    left(p_build, 200),
    left(p_user_agent, 500),
    v_fp
  );
end;
$$;

revoke all on function public.log_client_error(text, text, text, text, text, text) from public;
grant execute on function public.log_client_error(text, text, text, text, text, text) to anon, authenticated;

-- Admin-only read (newest first, max 500 rows). p_days is clamped to 1..30.
create or replace function public.admin_client_errors(p_days integer default 7)
returns table (
  id bigint,
  created_at timestamptz,
  surface text,
  message text,
  stack text,
  url text,
  build text,
  user_agent text,
  count integer,
  fingerprint text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.events_admin_assert_admin();

  return query
  select e.id, e.created_at, e.surface, e.message, e.stack, e.url, e.build, e.user_agent, e.count, e.fingerprint
  from public.client_errors e
  where e.created_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 30)))
  order by e.created_at desc
  limit 500;
end;
$$;

revoke all on function public.admin_client_errors(integer) from public, anon;
grant execute on function public.admin_client_errors(integer) to authenticated;