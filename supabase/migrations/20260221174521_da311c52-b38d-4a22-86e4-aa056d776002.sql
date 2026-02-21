
-- Europe snapshot table (mirrors linnuliigid_snapshot pattern)
CREATE TABLE public.europe_snapshot (
  id integer PRIMARY KEY DEFAULT 1,
  points_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz,
  status text NOT NULL DEFAULT 'empty',
  progress_done integer NOT NULL DEFAULT 0,
  progress_total integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS (public read, no public write)
ALTER TABLE public.europe_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read europe_snapshot"
  ON public.europe_snapshot FOR SELECT
  USING (true);

-- Seed the single row
INSERT INTO public.europe_snapshot (id) VALUES (1);

-- Updated_at trigger
CREATE TRIGGER update_europe_snapshot_updated_at
  BEFORE UPDATE ON public.europe_snapshot
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
