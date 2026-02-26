-- Runtime columns used by linnuliigid-snapshot watchdog/takeover logic.
alter table if exists public.linnuliigid_snapshot
  add column if not exists running_started_at timestamptz,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists run_id uuid;

-- Ensure base progress/status columns exist for older environments.
alter table if exists public.linnuliigid_snapshot
  add column if not exists status text not null default 'empty',
  add column if not exists progress_done integer not null default 0,
  add column if not exists progress_total integer not null default 0,
  add column if not exists generated_at timestamptz,
  add column if not exists points_json jsonb not null default '{}'::jsonb,
  add column if not exists last_error text;
