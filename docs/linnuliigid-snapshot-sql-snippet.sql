-- Linnuliigid snapshot safety columns (paste into Supabase SQL editor).
ALTER TABLE public.linnuliigid_snapshot
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS progress_done integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS progress_total integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;

INSERT INTO public.linnuliigid_snapshot (id)
SELECT 1
WHERE NOT EXISTS (
  SELECT 1 FROM public.linnuliigid_snapshot WHERE id = 1
);
