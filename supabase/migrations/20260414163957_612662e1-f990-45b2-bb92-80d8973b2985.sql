alter table public.ennustus_cache
  add column if not exists best_period_pct int,
  add column if not exists best_period_label text;