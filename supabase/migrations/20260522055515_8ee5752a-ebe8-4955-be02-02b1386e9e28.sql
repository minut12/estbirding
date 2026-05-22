CREATE TABLE IF NOT EXISTS public.ebird_rare_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ebird_sub_id TEXT NOT NULL,
  species_code TEXT NOT NULL,
  species_lat_name TEXT,
  species_et_name TEXT,
  rarity_level TEXT,
  country_code TEXT,
  region TEXT,
  location TEXT,
  lat NUMERIC,
  lng NUMERIC,
  distance_to_ee_km NUMERIC,
  obs_date TIMESTAMPTZ NOT NULL,
  obs_count INTEGER,
  observer_names TEXT[],
  wind_corridor_at_time JSONB,
  raw_observation JSONB,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ebird_rare_obs_unique UNIQUE (ebird_sub_id, species_code)
);

CREATE INDEX IF NOT EXISTS idx_ebird_rare_obs_date ON public.ebird_rare_observations (obs_date DESC);
CREATE INDEX IF NOT EXISTS idx_ebird_rare_obs_species ON public.ebird_rare_observations (species_code);
CREATE INDEX IF NOT EXISTS idx_ebird_rare_obs_country ON public.ebird_rare_observations (country_code);
CREATE INDEX IF NOT EXISTS idx_ebird_rare_obs_rarity ON public.ebird_rare_observations (rarity_level);

ALTER TABLE public.ebird_rare_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon read ebird_rare_observations" ON public.ebird_rare_observations;
CREATE POLICY "anon read ebird_rare_observations"
  ON public.ebird_rare_observations
  FOR SELECT
  TO anon, authenticated
  USING (true);
