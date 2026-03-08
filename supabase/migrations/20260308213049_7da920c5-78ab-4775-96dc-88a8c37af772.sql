
-- Create map_species_preferences table
CREATE TABLE public.map_species_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  map_scope text NOT NULL,
  species_key text NOT NULL,
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, map_scope, species_key)
);

-- Enable RLS
ALTER TABLE public.map_species_preferences ENABLE ROW LEVEL SECURITY;

-- Users can read own preferences
CREATE POLICY "Users can read own preferences"
  ON public.map_species_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert own preferences
CREATE POLICY "Users can insert own preferences"
  ON public.map_species_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update own preferences
CREATE POLICY "Users can update own preferences"
  ON public.map_species_preferences FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can delete own preferences
CREATE POLICY "Users can delete own preferences"
  ON public.map_species_preferences FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE TRIGGER map_species_preferences_updated_at
  BEFORE UPDATE ON public.map_species_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
