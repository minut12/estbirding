alter table public.elurikkus_cache add column if not exists t_dt timestamptz null;
comment on column public.elurikkus_cache.t_dt is 'Observation time (UTC) of the newest record, from Elurikkus event_datetime_precise; null when the observer gave only a date. P58b.';
