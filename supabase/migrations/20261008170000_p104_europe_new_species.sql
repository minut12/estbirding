-- 20261008170000_p104_europe_new_species.sql
-- P104: auto-add brand-new species seen in eBird "notable" (FI, SE, LV, LT, PL, BY + NW Russia:
-- RU-LEN, RU-SPE, RU-PSK, RU-NGR, RU-KR). One row per eBird species code, written only by the
-- europe-new-species Edge Function (service role). Guarantees each code is handled and pushed once.
-- status:
--   added          new species written to custom_species_v1.json + species_meta_v1.json, push sent
--   linked         species already in meta by Latin/Estonian name but without ebirdCode -> code filled in, no push
--   skipped_known  binomial already tracked under another code (e.g. eBird subspecies group)
--   skipped_exotic eBird exoticCategory X (escapee) or P (provisional)
--   skipped_taxon  not a species (spuh "sp.", slash, hybrid " x ")
--   no_et_name     Latin name not in Linnud.txt -> not added (no invented Estonian names)
--   failed         storage/push error (see error); retried on the next run
create table if not exists public.europe_new_species (
  ebird_code     text primary key,
  sci_name       text,
  com_name       text,
  name_et        text,
  status         text not null check (status in
                   ('added','linked','skipped_known','skipped_exotic','skipped_taxon','no_et_name','failed')),
  regions        text[] not null default '{}',
  obs_count      integer not null default 0,
  latest         jsonb,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  added_at       timestamptz,
  notified_at    timestamptz,
  error          text
);

alter table public.europe_new_species enable row level security;
revoke all on public.europe_new_species from anon, authenticated;
