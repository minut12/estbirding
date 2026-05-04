CREATE TABLE IF NOT EXISTS public.europe_ebird_cache (
  species_name TEXT NOT NULL,
  country_code TEXT NOT NULL CHECK (country_code IN ('FI','SE','LV','LT','PL','BY','RU')),
  occ7 INTEGER NOT NULL DEFAULT 0,
  latest_obs_date DATE,
  latest_lat DOUBLE PRECISION,
  latest_lon DOUBLE PRECISION,
  latest_loc TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (species_name, country_code)
);

CREATE INDEX IF NOT EXISTS idx_europe_ebird_cache_species
  ON public.europe_ebird_cache(species_name);

CREATE INDEX IF NOT EXISTS idx_europe_ebird_cache_fetched_at
  ON public.europe_ebird_cache(fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_europe_ebird_cache_country
  ON public.europe_ebird_cache(country_code);

ALTER TABLE public.europe_ebird_cache ENABLE ROW LEVEL SECURITY;