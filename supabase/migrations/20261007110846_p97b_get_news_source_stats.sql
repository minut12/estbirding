-- P97b: per-source activity stats for Seaded > Uudiste allikad (read-only, public data).
-- news_items is already world-readable (RLS: "Anyone can read news items"), so SECURITY INVOKER is enough.
create or replace function public.get_news_source_stats()
returns table (
  source_slug text,
  items_7d integer,
  items_30d integer,
  last_published_at timestamptz,
  translation_errors_30d integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    n.source_slug,
    count(*) filter (where coalesce(n.published_at, n.created_at) > now() - interval '7 days')::integer,
    count(*) filter (where coalesce(n.published_at, n.created_at) > now() - interval '30 days')::integer,
    max(n.published_at),
    count(*) filter (where n.translation_v2_error is not null
                       and coalesce(n.published_at, n.created_at) > now() - interval '30 days')::integer
  from public.news_items n
  where n.source_slug is not null
  group by n.source_slug
$$;

grant execute on function public.get_news_source_stats() to anon, authenticated;
