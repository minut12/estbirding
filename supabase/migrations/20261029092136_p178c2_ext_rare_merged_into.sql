-- p178c2_ext_rare_merged_into.sql
-- P178c2: one bird = one observation (Kristian, 29 Oct 2026).
-- merged_into points at the record this row was folded into:
--   'ebird:<subId>'            (eBird checklist id, as already carried by Euroopa cards and Ulevaade rows)
--   'tarsiger:<id>' | 'lofk:<source_id>'
-- null = this row is a main record and is shown.
-- Written only by ext-rare-refresh. The RPC returns merged rows too, so the client
-- can add their source tags (and Tarsiger nth / photo) to the main record.

alter table public.ext_rare_observations
  add column if not exists merged_into text;

create index if not exists ext_rare_observations_merged_into_idx
  on public.ext_rare_observations (merged_into)
  where merged_into is not null;

-- RPC body unchanged; select * picks up the new column. Re-created so the
-- returned row type includes merged_into.
create or replace function public.get_ext_rare_observations(p_days integer default 30)
returns setof public.ext_rare_observations
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.ext_rare_observations
  where obs_date_to >= ((now() at time zone 'Europe/Tallinn')::date - greatest(1, least(p_days, 365)))
  order by obs_date_to desc, source, source_id;
$$;
