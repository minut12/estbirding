-- Phase 3: per-observation data from elurikkus.ee
CREATE TABLE IF NOT EXISTS public.elurikkus_observations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  species_name      text NOT NULL,
  species_lat       text,
  observed_at       date NOT NULL,
  locality          text,
  county            text,
  lat               double precision,
  lon               double precision,
  observer          text,
  individual_count  integer,
  behavior          text,
  sub_id            text,
  fetched_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT elurikkus_observations_sub_id_unique
    UNIQUE NULLS NOT DISTINCT (sub_id)
);

CREATE INDEX IF NOT EXISTS idx_elurikkus_obs_species_name
  ON public.elurikkus_observations (species_name);

CREATE INDEX IF NOT EXISTS idx_elurikkus_obs_observed_at
  ON public.elurikkus_observations (observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_elurikkus_obs_species_observed
  ON public.elurikkus_observations (species_name, observed_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_elurikkus_obs_natural_key
  ON public.elurikkus_observations (species_name, observed_at, locality, observer)
  NULLS NOT DISTINCT
  WHERE sub_id IS NULL;

ALTER TABLE public.elurikkus_observations ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.elurikkus_observations IS
  'Per-observation bird sightings from elurikkus.ee. Populated twice daily by elurikkus-bulk-refresh Edge Function. Used by n8n vaatluste-koordinaator workflow to supplement Estonia section of Ülevaade reports.';

COMMENT ON COLUMN public.elurikkus_observations.observed_at IS
  'Actual observation date as recorded in elurikkus.ee (NOT the fetched_at timestamp).';

COMMENT ON COLUMN public.elurikkus_observations.sub_id IS
  'Stable identifier from elurikkus.ee for the observation record, when available. Used as primary dedup key. Falls back to (species_name, observed_at, locality, observer) composite key when NULL.';