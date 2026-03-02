create table if not exists public.translation_cache (
  id bigserial primary key,
  cache_key text not null unique,
  target_lang text not null,
  source_lang text,
  original_text text not null,
  translated_text text not null,
  created_at timestamptz not null default now()
);

create index if not exists translation_cache_cache_key_idx
  on public.translation_cache (cache_key);
