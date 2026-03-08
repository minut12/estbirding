CREATE TABLE public.linnuliigid_spring_dates (
  species_key TEXT PRIMARY KEY,
  species_name TEXT NOT NULL DEFAULT '',
  spring_date TEXT NOT NULL DEFAULT '',
  spring_time TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT DEFAULT ''
);

ALTER TABLE public.linnuliigid_spring_dates ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read spring dates (public data)
CREATE POLICY "Anyone can read spring dates"
  ON public.linnuliigid_spring_dates
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow anyone to insert spring dates (anonymous collaborative editing)
CREATE POLICY "Anyone can insert spring dates"
  ON public.linnuliigid_spring_dates
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Allow anyone to update spring dates
CREATE POLICY "Anyone can update spring dates"
  ON public.linnuliigid_spring_dates
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Allow anyone to delete spring dates
CREATE POLICY "Anyone can delete spring dates"
  ON public.linnuliigid_spring_dates
  FOR DELETE
  TO anon, authenticated
  USING (true);