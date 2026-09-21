-- P48-elurikkus-obs-fix-swapped-latlon.sql
-- Migration name: p48_elurikkus_obs_fix_swapped_latlon
-- APPLIED to prod rfjhrosxbaihyrnbmmbl on 2026-09-21 via the Supabase connector,
-- on Kristian's explicit go. This file is the repo record of what is already live.
-- Do NOT re-run it.
--
-- 266 elurikkus_observations rows (observer Margus Ellermaa, "Audru polder plot *",
-- Parnu maakond, 2025-05-03..2025-06-04) carried lat/lon swapped at source, plotting
-- at lat ~24.3 / lon ~58.4 (Arabian Sea) and minting 63 junk Toenaosus cells.
-- elurikkus-bulk-refresh upserts on sub_id and rewrites lat/lon on refetch, so a
-- one-off UPDATE would be reverted; the trigger makes the fix hold for every writer.
-- Predicate: lat 21.5-28.5 is impossible for a real Estonian point, and the swapped
-- point lands inside Estonia (lat 57.3-60.0). Pre-apply it matched exactly the 266.

create or replace function public.elurikkus_obs_fix_swapped_latlon()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare t double precision;
begin
  if new.lat between 21.5 and 28.5 and new.lon between 57.3 and 60.0 then
    t := new.lat;
    new.lat := new.lon;
    new.lon := t;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_elurikkus_obs_fix_swapped_latlon on public.elurikkus_observations;
create trigger trg_elurikkus_obs_fix_swapped_latlon
  before insert or update of lat, lon on public.elurikkus_observations
  for each row execute function public.elurikkus_obs_fix_swapped_latlon();

-- Fire the trigger on the existing bad rows (self-assign; trigger does the swap).
update public.elurikkus_observations
   set lat = lat
 where lat between 21.5 and 28.5 and lon between 57.3 and 60.0;
