-- Force-drop any lingering pre-auth-migration signatures of the archive/unarchive/delete RPCs
-- that the previous migration's drop statements may have missed (e.g. if PostgREST cached
-- a stale signature, or if the original function was created with a slightly different
-- argument list than the drop statement assumed).

drop function if exists public.events_admin_archive(text, uuid);
drop function if exists public.events_admin_archive(text, integer);
drop function if exists public.events_admin_unarchive(text, uuid);
drop function if exists public.events_admin_unarchive(text, integer);
drop function if exists public.events_admin_delete(text, uuid);
drop function if exists public.events_admin_delete(text, integer);

-- Recreate the new signatures (idempotent — `or replace` updates if present).

create or replace function public.events_admin_archive(p_id uuid)
returns public.events_manual
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.events_manual;
begin
  perform public.events_admin_assert_admin();

  update public.events_manual
     set status = 'archived', archived_at = now(), updated_at = now()
   where id = p_id
   returning * into v_row;

  if v_row.id is null then
    raise exception 'event not found';
  end if;

  return v_row;
end;
$$;

create or replace function public.events_admin_unarchive(p_id uuid)
returns public.events_manual
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.events_manual;
begin
  perform public.events_admin_assert_admin();

  update public.events_manual
     set status = 'active', archived_at = null, updated_at = now()
   where id = p_id
   returning * into v_row;

  if v_row.id is null then
    raise exception 'event not found';
  end if;

  return v_row;
end;
$$;

create or replace function public.events_admin_delete(p_id uuid)
returns public.events_manual
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.events_manual;
begin
  perform public.events_admin_assert_admin();

  update public.events_manual
     set status = 'deleted', deleted_at = now(), updated_at = now()
   where id = p_id
   returning * into v_row;

  if v_row.id is null then
    raise exception 'event not found';
  end if;

  return v_row;
end;
$$;

revoke execute on function public.events_admin_archive(uuid) from anon, authenticated, public;
revoke execute on function public.events_admin_unarchive(uuid) from anon, authenticated, public;
revoke execute on function public.events_admin_delete(uuid) from anon, authenticated, public;

grant execute on function public.events_admin_archive(uuid) to authenticated;
grant execute on function public.events_admin_unarchive(uuid) to authenticated;
grant execute on function public.events_admin_delete(uuid) to authenticated;

-- Force PostgREST to reload its schema cache so it picks up the new signatures.
notify pgrst, 'reload schema';
