-- Phase 5 Step 1: Kevadränne (migration progress) section in elurikkus_raport
ALTER TABLE public.elurikkus_raport
  ADD COLUMN IF NOT EXISTS kevadranne_narrative_et text,
  ADD COLUMN IF NOT EXISTS kevadranne_arrivals     jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.elurikkus_raport.kevadranne_narrative_et IS
  '2-4 sentence Sonnet-generated paragraph about spring migration progress in the current 14-day period.';

COMMENT ON COLUMN public.elurikkus_raport.kevadranne_arrivals IS
  'List of species that appeared in current period but were absent from previous 14-day period. Each entry: { species_et, species_lat, first_obs_date, locality, observer, obs_count_in_period }. Computed deterministically by elurikkus n8n workflow Code node.';