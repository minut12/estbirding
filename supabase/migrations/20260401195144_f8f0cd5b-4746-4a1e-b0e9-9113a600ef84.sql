CREATE POLICY "Authenticated can delete prediction jobs"
ON public.prediction_jobs
FOR DELETE
TO authenticated
USING (true);