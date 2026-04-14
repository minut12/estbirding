-- Drop the authenticated-only write policy
drop policy if exists "ennustus_cache write for authenticated" on public.ennustus_cache;

-- Allow anyone (including anon) to write
create policy "ennustus_cache write for all"
  on public.ennustus_cache
  for all
  using (true)
  with check (true);