-- P181k prediction track record
-- P181k: per-species track record of the Toenaosus (Ulevaade) arrival predictions.
-- Read-only RPC, no table changes.
--
-- Source of truth: public.prediction_outcomes (filled nightly 03:40 UTC by the
-- prediction-outcomes Edge Function). Only rows that are a real, scored,
-- species-level probability are used:
--   site_index = -1                       species-level row (not a per-site row)
--   outcome in ('species_hit','miss')     not_scored rows are excluded
--   predicted_pct is not null             watch-list rows carry no probability
-- A "hit" means: at least one Estonian record of the species dated inside the
-- prediction's window (window_start..window_end, 5 d / 7 d / phenology <= 60 d).
--
-- Independence: raports are generated about twice a day and each one repeats the
-- prediction for the same species with a window that overlaps the previous one,
-- so the raw rows are strongly autocorrelated (one long stay = dozens of hits).
-- Besides the raw counts the function returns an "independent" subset per
-- species: walking the predictions in generated_at order, a prediction is kept
-- only when its window_start is after the window_end of the last kept one
-- (greedy non-overlapping windows). p_min_n and small_sample are judged on that
-- independent count, never on the raw count.
--
-- Output is one row per species - nothing is aggregated across species.

create or replace function public.get_prediction_track_record(
  p_species text default null,
  p_min_n integer default 5
)
returns table (
  ebird_code text,
  species_et text,
  n integer,
  hits integer,
  n_independent integer,
  hits_independent integer,
  mean_predicted_pct numeric,
  observed_pct numeric,
  brier numeric,
  brier_independent numeric,
  small_sample boolean,
  first_window_start date,
  last_window_end date,
  buckets jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with recursive s as (
    select
      o.ebird_code,
      o.species_et,
      o.raport_id,
      r.generated_at,
      o.window_start,
      o.window_end,
      o.predicted_pct,
      (o.outcome = 'species_hit')::int as hit,
      least(4, floor(o.predicted_pct / 20.0)::int) as bucket
    from public.prediction_outcomes o
    join public.toenaosus_raport r on r.id = o.raport_id
    where o.site_index = -1
      and o.outcome in ('species_hit', 'miss')
      and o.predicted_pct is not null
      and o.window_start is not null
      and o.window_end is not null
      and (
        p_species is null
        or o.ebird_code = p_species
        or lower(o.species_et) = lower(p_species)
      )
  ),
  pick as (
    select f.ebird_code, f.window_end, f.predicted_pct, f.hit, f.bucket
    from (
      select distinct on (s.ebird_code)
        s.ebird_code, s.window_end, s.predicted_pct, s.hit, s.bucket
      from s
      order by s.ebird_code, s.generated_at, s.raport_id
    ) f
    union all
    select nx.ebird_code, nx.window_end, nx.predicted_pct, nx.hit, nx.bucket
    from pick p
    cross join lateral (
      select s.ebird_code, s.window_end, s.predicted_pct, s.hit, s.bucket
      from s
      where s.ebird_code = p.ebird_code
        and s.window_start > p.window_end
      order by s.generated_at, s.raport_id
      limit 1
    ) nx
  ),
  raw_species as (
    select
      s.ebird_code,
      (array_agg(s.species_et order by s.generated_at desc))[1] as species_et,
      count(*)::int as n,
      sum(s.hit)::int as hits,
      round(avg(s.predicted_pct), 1) as mean_predicted_pct,
      round(100.0 * sum(s.hit) / count(*), 1) as observed_pct,
      round(avg(power(s.predicted_pct / 100.0 - s.hit, 2)), 4) as brier,
      min(s.window_start) as first_window_start,
      max(s.window_end) as last_window_end
    from s
    group by s.ebird_code
  ),
  ind_species as (
    select
      p.ebird_code,
      count(*)::int as n_independent,
      sum(p.hit)::int as hits_independent,
      round(avg(power(p.predicted_pct / 100.0 - p.hit, 2)), 4) as brier_independent
    from pick p
    group by p.ebird_code
  ),
  raw_bucket as (
    select s.ebird_code, s.bucket,
      count(*)::int as n,
      sum(s.hit)::int as hits,
      round(avg(s.predicted_pct), 1) as mean_predicted_pct
    from s
    group by s.ebird_code, s.bucket
  ),
  ind_bucket as (
    select p.ebird_code, p.bucket,
      count(*)::int as n_independent,
      sum(p.hit)::int as hits_independent
    from pick p
    group by p.ebird_code, p.bucket
  ),
  bucket_json as (
    select
      rs.ebird_code,
      jsonb_agg(
        jsonb_build_object(
          'lo', b.i * 20,
          'hi', (b.i + 1) * 20,
          'n', coalesce(rb.n, 0),
          'hits', coalesce(rb.hits, 0),
          'mean_predicted_pct', rb.mean_predicted_pct,
          'observed_pct',
            case when rb.n > 0 then round(100.0 * rb.hits / rb.n, 1) end,
          'n_independent', coalesce(ib.n_independent, 0),
          'hits_independent', coalesce(ib.hits_independent, 0)
        )
        order by b.i
      ) as buckets
    from raw_species rs
    cross join generate_series(0, 4) as b(i)
    left join raw_bucket rb on rb.ebird_code = rs.ebird_code and rb.bucket = b.i
    left join ind_bucket ib on ib.ebird_code = rs.ebird_code and ib.bucket = b.i
    group by rs.ebird_code
  )
  select
    rs.ebird_code,
    rs.species_et,
    rs.n,
    rs.hits,
    i.n_independent,
    i.hits_independent,
    rs.mean_predicted_pct,
    rs.observed_pct,
    rs.brier,
    i.brier_independent,
    (i.n_independent < 10) as small_sample,
    rs.first_window_start,
    rs.last_window_end,
    bj.buckets
  from raw_species rs
  join ind_species i on i.ebird_code = rs.ebird_code
  join bucket_json bj on bj.ebird_code = rs.ebird_code
  where i.n_independent >= greatest(coalesce(p_min_n, 5), 1)
  order by i.n_independent desc, rs.n desc, rs.species_et;
$$;

revoke all on function public.get_prediction_track_record(text, integer) from public;
grant execute on function public.get_prediction_track_record(text, integer)
  to anon, authenticated, service_role;

comment on function public.get_prediction_track_record(text, integer) is
  'P181k: per-species track record (calibration buckets + Brier) of scored Toenaosus predictions from prediction_outcomes. n_independent counts non-overlapping windows; p_min_n filters on it.';