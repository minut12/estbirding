-- P97c1: photo credit for avatars picked from iNaturalist / Wikimedia Commons.
-- credit = { author, source: 'inaturalist'|'wikimedia', license: 'cc0'|'cc-by'|'cc-by-sa', licenseUrl?, pageUrl } or null.
-- Existing rows keep credit = null (no credit line shown).
alter table public.bird_avatar_map
  add column if not exists credit jsonb;

alter table public.bird_avatar_map
  drop constraint if exists bird_avatar_map_credit_is_object;
alter table public.bird_avatar_map
  add constraint bird_avatar_map_credit_is_object
  check (credit is null or jsonb_typeof(credit) = 'object');

-- get_all_avatars() gains the credit column. The return type changes, so drop + create
-- (first time this function is defined in the repo; adds search_path hardening, same grants).
drop function if exists public.get_all_avatars();

create function public.get_all_avatars()
returns table (species_key text, public_url text, credit jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select species_key, public_url, credit from public.bird_avatar_map order by species_key;
$$;

grant execute on function public.get_all_avatars() to public, anon, authenticated, service_role;
