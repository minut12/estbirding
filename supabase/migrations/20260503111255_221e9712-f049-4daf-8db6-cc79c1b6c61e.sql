CREATE TABLE IF NOT EXISTS public.elurikkus_raport (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_at    timestamptz NOT NULL DEFAULT now(),
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  intro_et        text,
  estonia_entries jsonb NOT NULL DEFAULT '[]'::jsonb,
  generation_meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_elurikkus_raport_generated_at
  ON public.elurikkus_raport (generated_at DESC);

COMMENT ON TABLE public.elurikkus_raport IS
  'Estonia-only Ülevaade reports sourced from elurikkus_observations. Companion to vaatluste_raport. Frontend fetches both and merges at render time.';

COMMENT ON COLUMN public.elurikkus_raport.estonia_entries IS
  'Same shape as vaatluste_raport.estonia_entries but populated only from elurikkus.ee observations. Frontend dedupes against vaatluste_raport.estonia_entries by composite key (species_et + date + locality).';

ALTER TABLE public.elurikkus_raport ENABLE ROW LEVEL SECURITY;

CREATE POLICY "elurikkus_raport read for all"
  ON public.elurikkus_raport
  FOR SELECT
  USING (true);

CREATE POLICY "elurikkus_raport insert for service role"
  ON public.elurikkus_raport
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');