-- P164: observer-recorded time of an Elurikkus sighting (UTC), only when Elurikkus carries one
-- (event_datetime_precise with a time part). observed_at stays the date. Used to order
-- same-day sightings newest first in get-elurikkus-recent-obs, so the maps agree on "newest".
alter table public.elurikkus_observations add column if not exists observed_dt timestamptz;
comment on column public.elurikkus_observations.observed_dt is
  'P164: observer-recorded time (UTC) from Elurikkus event_datetime_precise; null when the record has no time';
