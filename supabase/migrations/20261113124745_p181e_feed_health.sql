-- P181e: per-feed freshness targets, feed_health() RPC, miss counters, hourly check job,
-- ops-alert opt-in on push subscriptions. New objects only; no existing schedule is touched.

-- ---------------------------------------------------------------------------
-- 1. Targets
create table if not exists public.feed_targets (
  feed            text primary key,
  label           text not null,                       -- Estonian label used in the push text
  kind            text not null default 'age' check (kind in ('age', 'daily')),
  max_age         interval,                            -- kind = 'age'
  due_local       time,                                -- kind = 'daily': deadline, Europe/Tallinn wall clock
  active_from_utc smallint check (active_from_utc between 0 and 23),  -- optional UTC hour window (inclusive)
  active_to_utc   smallint check (active_to_utc between 0 and 23),
  enabled         boolean not null default true,
  note            text,
  check ((kind = 'age' and max_age is not null) or (kind = 'daily' and due_local is not null))
);
alter table public.feed_targets enable row level security;
revoke all on public.feed_targets from anon, authenticated;

insert into public.feed_targets (feed, label, kind, max_age, due_local, active_from_utc, active_to_utc, note) values
  ('elurikkus_recent', 'Elurikkus (v' || U&'\00E4' || 'rsked)', 'age', interval '1 hour', null, null, null,
     'cron 5,35 * * * *. Signal = newer of elurikkus_cache.fetched_at and last ok cron_runs row: an up_to_date run writes no rows.'),
  ('ebird_ee', 'eBird Eesti', 'age', interval '11 hours', null, null, null,
     'Netlify 0 4,11,18 UTC: the 18->04 gap is 10 h, so the proposed 8 h would alert every night. Signal = ebird_cache.fetched_at.'),
  ('ebird_europe', 'eBird Euroopa', 'age', interval '13 hours', null, null, null,
     'Netlify 45 3,15 UTC. Signal = europe_ebird_cache.fetched_at.'),
  ('ennustus', 'Ennustus', 'age', interval '13 hours', null, null, null,
     'cron 0 4,16 UTC. Signal = ennustus_cache.updated_at.'),
  ('news', 'Uudiste t' || U&'\00F5' || 'lge', 'age', interval '2 hours', null, 5, 21,
     'cron 10 5-21 UTC. Signal = newer of news_items.translated_v2_at and last ok cron_runs row (a run with nothing to translate writes no rows). Age counts from 05:00 UTC at the earliest.'),
  ('news_ingest', 'Uudiste kogumine', 'age', interval '26 hours', null, null, null,
     'Added: cron 0 5 UTC daily. Signal = news_items.fetched_at. The hourly translate job can be healthy while ingest is dead.'),
  ('vaatluste_raport', 'Vaatluste raport', 'daily', null, time '19:30', null, null,
     'cron 0 16 UTC = 18:00 Tallinn in winter but 19:00 in summer, so the proposed 18:30 would miss every summer day.'),
  ('elurikkus_raport', 'Elurikkuse raport', 'daily', null, time '19:30', null, null, 'cron 5 16 UTC; see vaatluste_raport.'),
  ('toenaosus_raport', 'T' || U&'\00F5' || 'en' || U&'\00E4' || 'osuse raport', 'daily', null, time '19:30', null, null, 'cron 10 16 UTC; see vaatluste_raport.'),
  ('ext_rare', 'Naabermaade haruldused', 'age', interval '13 hours', null, null, null,
     'cron 20 4,16 UTC. Signal = ext_rare_observations.last_seen_at (not logged in cron_runs).'),
  ('movebank', 'GPS-linnud (Movebank)', 'age', interval '4 hours', null, null, null,
     'cron 20 */3 UTC. Signal = gps_tracked_birds.fetched_at.'),
  ('gbif', 'GBIF', 'age', interval '8 days', null, null, null,
     'weekly Sunday jobs gbif, gbif_fi/se/lv/lt/ru. Signal = oldest of the six jobs'' last completed run in cron_runs (gbif_occurrences has 778k rows and no fetched_at index; a run may also upsert 0 rows).')
on conflict (feed) do nothing;

-- ---------------------------------------------------------------------------
-- 2. State (consecutive misses, last alert)
create table if not exists public.feed_health_state (
  feed               text primary key,
  status             text not null,
  consecutive_misses integer not null default 0,
  alerted            boolean not null default false,   -- an alert push went out and no recovery push yet
  last_alert_at      timestamptz,
  last_ok_at         timestamptz,
  last_checked_at    timestamptz not null default now(),
  detail             text
);
alter table public.feed_health_state enable row level security;
revoke all on public.feed_health_state from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. feed_health(): service_role, direct DB sessions (pg_cron / SQL editor) and admins only
create or replace function public.feed_health()
returns table (
  feed text, label text, last_ok_at timestamptz, age interval,
  target text, status text, detail text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_now   timestamptz := now();
  v_local timestamp   := now() at time zone 'Europe/Tallinn';
  v_hour  int         := extract(hour from now() at time zone 'UTC');
  v_day0  timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
begin
  -- PostgREST always sets a JWT role; no role at all means a direct DB session (pg_cron, SQL editor).
  if auth.role() is not null and auth.role() <> 'service_role' then
    perform public.events_admin_assert_admin();
  end if;

  return query
  with job_ok as (
    select c.job, max(c.finished_at) as last_ok,
           max(c.finished_at) filter (where c.state->>'stopped' = 'done') as last_done
    from public.cron_runs c
    where c.ok is true and c.started_at > v_now - interval '30 days'
    group by c.job
  ),
  job_last as (
    select distinct on (c.job) c.job, c.started_at, c.ok, c.error
    from public.cron_runs c
    where c.started_at > v_now - interval '30 days'
    order by c.job, c.started_at desc
  ),
  sig (feed, last_ok_at, src, job) as (
    select 'elurikkus_recent', greatest((select max(e.fetched_at) from public.elurikkus_cache e),
                                        (select j.last_ok from job_ok j where j.job = 'elurikkus_recent')),
           'elurikkus_cache.fetched_at | cron_runs', 'elurikkus_recent'
    union all select 'ebird_ee', (select max(e.fetched_at) from public.ebird_cache e), 'ebird_cache.fetched_at', 'ebird-ee'
    union all select 'ebird_europe', (select max(e.fetched_at) from public.europe_ebird_cache e), 'europe_ebird_cache.fetched_at', 'ebird-europe'
    union all select 'ennustus', (select max(e.updated_at) from public.ennustus_cache e), 'ennustus_cache.updated_at', 'ennustus'
    union all select 'news', greatest((select max(n.translated_v2_at) from public.news_items n),
                                      (select j.last_ok from job_ok j where j.job = 'news')),
           'news_items.translated_v2_at | cron_runs', 'news'
    union all select 'news_ingest', (select max(n.fetched_at) from public.news_items n), 'news_items.fetched_at', null
    union all select 'vaatluste_raport', (select max(r.generated_at) from public.vaatluste_raport r), 'vaatluste_raport.generated_at', 'vaatluste-raport'
    union all select 'elurikkus_raport', (select max(r.generated_at) from public.elurikkus_raport r), 'elurikkus_raport.generated_at', 'elurikkus-raport'
    union all select 'toenaosus_raport', (select max(r.generated_at) from public.toenaosus_raport r), 'toenaosus_raport.generated_at', 'toenaosus-raport'
    union all select 'ext_rare', (select max(x.last_seen_at) from public.ext_rare_observations x), 'ext_rare_observations.last_seen_at', null
    union all select 'movebank', (select max(g.fetched_at) from public.gps_tracked_birds g), 'gps_tracked_birds.fetched_at', null
    union all select 'gbif',
           (select case when count(j.last_done) = 6 then min(j.last_done) end
              from unnest(array['gbif','gbif_fi','gbif_se','gbif_lv','gbif_lt','gbif_ru']) as w(job)
              left join job_ok j on j.job = w.job),
           'cron_runs gbif* (oldest completed)', 'gbif'
  ),
  ev as (
    select t.feed, t.label, t.kind, t.max_age, t.due_local, s.last_ok_at, s.src,
           jl.started_at as job_started, jl.ok as job_ok_flag, jl.error as job_error,
           (t.kind = 'age' and t.active_from_utc is not null and t.active_to_utc is not null
              and not (v_hour between t.active_from_utc and t.active_to_utc)) as outside,
           -- age that counts against the target: inside a window it never starts before the window opens
           case when t.kind = 'age' and t.active_from_utc is not null
                then greatest(s.last_ok_at, v_day0 + make_interval(hours => t.active_from_utc))
                else s.last_ok_at end as eff_since,
           -- daily: the report must exist for today (Tallinn) once the deadline passed, else for yesterday
           (case when v_local::time >= t.due_local then v_local::date else v_local::date - 1 end)::timestamp
             at time zone 'Europe/Tallinn' as required_since
    from public.feed_targets t
    left join sig s on s.feed = t.feed
    left join job_last jl on jl.job = s.job
    where t.enabled
  )
  select e.feed, e.label, e.last_ok_at,
         date_trunc('second', v_now - e.last_ok_at) as age,
         case when e.kind = 'daily'
              then 'daily by ' || to_char(e.due_local, 'HH24:MI') || ' Europe/Tallinn'
              else '<= ' || e.max_age::text end as target,
         case
           when e.last_ok_at is null then 'missing'
           when e.kind = 'daily' then case when e.last_ok_at >= e.required_since then 'ok' else 'missing' end
           when e.outside then 'ok'
           when v_now - e.eff_since > e.max_age then 'late'
           else 'ok'
         end as status,
         concat_ws('; ',
           'signal ' || coalesce(e.src, 'none defined'),
           case when e.outside then 'outside active window' end,
           case when e.kind = 'daily' then 'needs a report since ' || to_char(e.required_since at time zone 'Europe/Tallinn', 'YYYY-MM-DD HH24:MI') end,
           case when e.job_started is not null then
             'last job run ' || to_char(e.job_started at time zone 'UTC', 'MM-DD HH24:MI') || ' UTC '
             || case when e.job_ok_flag is true then 'ok' when e.job_ok_flag is false then 'failed' else 'unfinished' end
             || coalesce(': ' || left(e.job_error, 120), '') end
         ) as detail
  from ev e
  order by e.feed;
end;
$$;
revoke all on function public.feed_health() from public, anon;
grant execute on function public.feed_health() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. feed_health_tick(): one check = update counters, say which feeds need a push.
--    action: 'alert' (2+ consecutive misses and no alert in the last 12 h), 'recover' (ok again after an alert).
create or replace function public.feed_health_tick()
returns table (
  feed text, label text, status text, age interval, target text, detail text,
  consecutive_misses integer, action text
)
language plpgsql
security definer
set search_path to 'public'
as $$
#variable_conflict use_column
begin
  return query
  with h as (select * from public.feed_health()),
  up as (
    insert into public.feed_health_state as s (feed, status, consecutive_misses, last_ok_at, last_checked_at, detail)
    select h.feed, h.status, case when h.status = 'ok' then 0 else 1 end, h.last_ok_at, now(), h.detail from h
    on conflict (feed) do update set
      status = excluded.status,
      consecutive_misses = case when excluded.status = 'ok' then 0 else s.consecutive_misses + 1 end,
      last_ok_at = excluded.last_ok_at,
      last_checked_at = excluded.last_checked_at,
      detail = excluded.detail
    returning s.feed, s.consecutive_misses, s.alerted, s.last_alert_at
  )
  select h.feed, h.label, h.status, h.age, h.target, h.detail, up.consecutive_misses,
         case
           when h.status = 'ok' and up.alerted then 'recover'
           when h.status <> 'ok' and up.consecutive_misses >= 2
                and (up.last_alert_at is null or up.last_alert_at <= now() - interval '12 hours') then 'alert'
         end as action
  from h join up on up.feed = h.feed
  order by h.feed;
end;
$$;
revoke all on function public.feed_health_tick() from public, anon, authenticated;
grant execute on function public.feed_health_tick() to service_role;

-- Called by the edge function after the push actually went out.
create or replace function public.feed_health_mark(p_feeds text[], p_action text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare n integer;
begin
  if p_action = 'alert' then
    update public.feed_health_state set alerted = true, last_alert_at = now() where feed = any(p_feeds);
  elsif p_action = 'recover' then
    update public.feed_health_state set alerted = false where feed = any(p_feeds);
  else
    raise exception 'unknown action %', p_action;
  end if;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.feed_health_mark(text[], text) from public, anon, authenticated;
grant execute on function public.feed_health_mark(text[], text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Ops-alert opt-in per device
alter table public.push_subscriptions add column if not exists ops_alerts boolean not null default false;

-- Only admin_set_ops_alerts() (or service_role / a direct DB session) may change the flag;
-- any other insert/update keeps the stored value, whatever the table's own policies allow.
create or replace function public.push_subscriptions_guard_ops_alerts()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if auth.role() is null
     or auth.role() = 'service_role'
     or coalesce(current_setting('estbirds.ops_alerts_admin', true), '') = '1' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.ops_alerts := false;
  else
    new.ops_alerts := old.ops_alerts;
  end if;
  return new;
end;
$$;
drop trigger if exists push_subscriptions_guard_ops_alerts on public.push_subscriptions;
create trigger push_subscriptions_guard_ops_alerts
  before insert or update on public.push_subscriptions
  for each row execute function public.push_subscriptions_guard_ops_alerts();

create or replace function public.admin_set_ops_alerts(p_endpoint text, p_on boolean)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare v boolean;
begin
  perform public.events_admin_assert_admin();
  perform set_config('estbirds.ops_alerts_admin', '1', true);
  update public.push_subscriptions set ops_alerts = coalesce(p_on, false)
   where endpoint = p_endpoint
   returning ops_alerts into v;
  perform set_config('estbirds.ops_alerts_admin', '', true);
  if v is null then
    raise exception 'subscription not found' using errcode = 'P0002';
  end if;
  return v;
end;
$$;
revoke all on function public.admin_set_ops_alerts(text, boolean) from public, anon;
grant execute on function public.admin_set_ops_alerts(text, boolean) to authenticated;

-- Current state for the toggle (push_sub_get does not return the flag).
create or replace function public.admin_get_ops_alerts(p_endpoint text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  perform public.events_admin_assert_admin();
  return coalesce((select s.ops_alerts from public.push_subscriptions s where s.endpoint = p_endpoint), false);
end;
$$;
revoke all on function public.admin_get_ops_alerts(text) from public, anon;
grant execute on function public.admin_get_ops_alerts(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Hourly check at minute 25 (new job only)
select cron.schedule('m7-feed-health', '25 * * * *', $cron$select public.m7_call_ef('feed-health', '{}'::jsonb)$cron$);