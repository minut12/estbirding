ALTER TABLE public.ebird_rare_observations
  ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMP WITH TIME ZONE;

-- Partial index: unnotified rows by rarity and distance (used by n8n notify node)
CREATE INDEX IF NOT EXISTS idx_ebird_rare_obs_unnotified
  ON public.ebird_rare_observations (rarity_level, distance_to_ee_km, notification_sent_at)
  WHERE notification_sent_at IS NULL;