-- User-scoped pins for individual eBird observation markers on the USA maps.
-- Each row = one pinned eBird observation (single sighting) on one map for one user.

CREATE TABLE IF NOT EXISTS public.ebird_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  map_scope text NOT NULL,
  ebird_id text NOT NULL,
  species text NOT NULL,
  species_code text,
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  obs_date text,
  location_name text,
  count_observed integer,
  checklist_sub_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, map_scope, ebird_id)
);

-- Fast lookup of a user's pins for a given map.
CREATE INDEX IF NOT EXISTS ebird_pins_user_scope_idx
  ON public.ebird_pins (user_id, map_scope);

-- GRANT permissions for authenticated users and service role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ebird_pins TO authenticated;
GRANT ALL ON public.ebird_pins TO service_role;

ALTER TABLE public.ebird_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own ebird pins"
  ON public.ebird_pins FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own ebird pins"
  ON public.ebird_pins FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own ebird pins"
  ON public.ebird_pins FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own ebird pins"
  ON public.ebird_pins FOR DELETE
  USING (auth.uid() = user_id);