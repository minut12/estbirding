
-- Snapshot table for server-side pre-computed bird occurrence data
CREATE TABLE public.linnuliigid_snapshot (
  id integer PRIMARY KEY DEFAULT 1,
  points_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz,
  status text NOT NULL DEFAULT 'empty',
  progress_done integer NOT NULL DEFAULT 0,
  progress_total integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Seed the single row
INSERT INTO public.linnuliigid_snapshot (id) VALUES (1);

-- Enable RLS with public read
ALTER TABLE public.linnuliigid_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read snapshot"
ON public.linnuliigid_snapshot
FOR SELECT
USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_linnuliigid_snapshot_updated_at
BEFORE UPDATE ON public.linnuliigid_snapshot
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
