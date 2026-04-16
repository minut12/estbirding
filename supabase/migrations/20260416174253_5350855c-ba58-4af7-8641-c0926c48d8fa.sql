
-- Web Push subscriptions table
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL UNIQUE,
  key_p256dh text NOT NULL,
  key_auth text NOT NULL,
  subscribed_species text[] NOT NULL DEFAULT '{}',
  device_label text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index to speed up array-overlap lookups
CREATE INDEX IF NOT EXISTS push_subscriptions_subscribed_species_gin
  ON public.push_subscriptions USING gin (subscribed_species);

-- Auto-update updated_at on row updates (reuses existing helper)
DROP TRIGGER IF EXISTS push_subscriptions_set_updated_at ON public.push_subscriptions;
CREATE TRIGGER push_subscriptions_set_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- RLS: permissive policies (endpoint URL itself acts as credential)
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_push_sub" ON public.push_subscriptions;
CREATE POLICY "anon_insert_push_sub"
  ON public.push_subscriptions FOR INSERT
  TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_push_sub" ON public.push_subscriptions;
CREATE POLICY "anon_select_push_sub"
  ON public.push_subscriptions FOR SELECT
  TO anon USING (true);

DROP POLICY IF EXISTS "anon_update_push_sub" ON public.push_subscriptions;
CREATE POLICY "anon_update_push_sub"
  ON public.push_subscriptions FOR UPDATE
  TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_push_sub" ON public.push_subscriptions;
CREATE POLICY "anon_delete_push_sub"
  ON public.push_subscriptions FOR DELETE
  TO anon USING (true);

DROP POLICY IF EXISTS "service_role_all_push_sub" ON public.push_subscriptions;
CREATE POLICY "service_role_all_push_sub"
  ON public.push_subscriptions FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- RPC: find all subscriptions matching any species in the input list
CREATE OR REPLACE FUNCTION public.get_subscriptions_for_species(species_list text[])
RETURNS TABLE(
  endpoint text,
  key_p256dh text,
  key_auth text,
  subscribed_species text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT endpoint, key_p256dh, key_auth, subscribed_species
  FROM public.push_subscriptions
  WHERE subscribed_species && species_list;
$$;

GRANT EXECUTE ON FUNCTION public.get_subscriptions_for_species(text[]) TO anon, authenticated, service_role;
