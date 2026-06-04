CREATE TABLE public.ufo_sightings (
  case_id    text PRIMARY KEY,
  occurred   timestamptz,
  submitted  timestamptz,
  lat        double precision NOT NULL,
  lon        double precision NOT NULL,
  city       text,
  region     text,
  shape      text,
  summary    text,
  source     text,
  tags       text[] DEFAULT '{}',
  url        text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.ufo_sightings TO service_role;

ALTER TABLE public.ufo_sightings ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_ufo_sightings_submitted ON public.ufo_sightings (submitted DESC);