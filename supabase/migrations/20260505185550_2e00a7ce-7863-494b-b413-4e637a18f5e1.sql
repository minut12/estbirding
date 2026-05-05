CREATE TABLE public.species_year_first_obs (
  species_et text NOT NULL,
  year smallint NOT NULL,
  first_obs_date date NOT NULL,
  locality text NULL,
  observer text NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (species_et, year)
);

CREATE INDEX idx_species_year_first_obs_year ON public.species_year_first_obs (year);

ALTER TABLE public.species_year_first_obs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "species_year_first_obs_read"
  ON public.species_year_first_obs
  FOR SELECT
  USING (true);

CREATE POLICY "species_year_first_obs_insert_service"
  ON public.species_year_first_obs
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "species_year_first_obs_update_service"
  ON public.species_year_first_obs
  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');