alter table if exists public.snapshot_state
  add column if not exists started_at timestamptz null,
  add column if not exists finished_at timestamptz null;
