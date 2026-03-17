
-- Create prediction_jobs table for async species prediction
CREATE TABLE public.prediction_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL UNIQUE,
  species_key text NOT NULL,
  species_name text NOT NULL,
  scope text NOT NULL DEFAULT 'linnuliigid',
  status text NOT NULL DEFAULT 'running',
  settings jsonb,
  result_json jsonb,
  error_json jsonb,
  analysis_version text,
  generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_prediction_jobs_request_id ON public.prediction_jobs (request_id);
CREATE INDEX idx_prediction_jobs_species_scope ON public.prediction_jobs (species_key, scope);
CREATE INDEX idx_prediction_jobs_status ON public.prediction_jobs (status);

-- Enable RLS
ALTER TABLE public.prediction_jobs ENABLE ROW LEVEL SECURITY;

-- Public read policy (prediction results are not user-specific sensitive data)
CREATE POLICY "Anyone can read prediction jobs"
ON public.prediction_jobs
FOR SELECT
USING (true);

-- Auto-cleanup: allow service role to manage all rows (edge functions use service role)
-- No insert/update/delete for anon/authenticated - only edge functions via service role
