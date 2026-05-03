ALTER TABLE public.elurikkus_cache
  ADD COLUMN IF NOT EXISTS individual_count integer,
  ADD COLUMN IF NOT EXISTS behavior         text,
  ADD COLUMN IF NOT EXISTS collectors       text;

COMMENT ON COLUMN public.elurikkus_cache.individual_count IS
  'Most-recent observation individual count (arv: isendit). Populated by elurikkus-bulk-refresh.';
COMMENT ON COLUMN public.elurikkus_cache.behavior IS
  'Most-recent observation behavior code (käitumine — flying, breeding, etc.). Populated by elurikkus-bulk-refresh.';
COMMENT ON COLUMN public.elurikkus_cache.collectors IS
  'Most-recent observation observer name(s), comma-separated when multiple. Populated by elurikkus-bulk-refresh.';