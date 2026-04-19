-- Add observation detail fields to elurikkus_cache
-- These fields are extracted from eElurikkus search result rows and
-- populated by the elurikkus-bulk-refresh Edge Function.
-- Existing rows will have NULL values until the next bulk refresh run.

ALTER TABLE public.elurikkus_cache
  ADD COLUMN IF NOT EXISTS individual_count text,
  ADD COLUMN IF NOT EXISTS behavior         text,
  ADD COLUMN IF NOT EXISTS collectors       text;
