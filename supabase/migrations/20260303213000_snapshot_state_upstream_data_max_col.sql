alter table if exists public.snapshot_state
  add column if not exists last_upstream_data_max_at timestamptz null;
