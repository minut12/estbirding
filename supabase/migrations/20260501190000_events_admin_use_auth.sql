-- Migrate Events admin gate from shared bcrypt key to Supabase Auth + is_admin role.
-- After this migration:
--   - All events_admin_* RPCs require an authenticated user with role='admin'
--   - The bcrypt key gate (events_admin_assert_key, expected_key_hash, require_pgcrypto, GUC) is removed
--   - Frontend stops sending the admin_key parameter

-- 1. Drop the old key-based RPCs.
--    events_admin_create has two overloads in the DB (pre- and post-image-fields migration); drop both.
drop function if exists public.events_admin_health(text);
drop function if exists public.events_admin_create(text, text, timestamptz, timestamptz, text, text, double precision, double precision, text, text);
drop function if exists public.events_admin_create(text, text, timestamptz, timestamptz, text, text, double precision, double precision, text, text, text, text);
drop function if exists public.events_admin_update(text, uuid, jsonb);
drop function if exists public.events_admin_archive(text, uuid);
drop function if exists public.events_admin_unarchive(text, uuid);
drop function if exists public.events_admin_delete(text, uuid);

-- 2. Drop the bcrypt verification helpers.
drop function if exists public.events_admin_assert_key(text);
drop function if exists public.events_admin_expected_key_hash();
drop function if exists public.events_admin_require_pgcrypto();

-- 3. New gate: assert the calling user is an authenticated admin.
--    Reuses public.has_role() which already exists in the schema.
create or replace function public.events_admin_assert_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'admin role required' using errcode = '42501';
  end if;
end;
$$;

-- 4. Recreate the RPCs without admin_key.
--    Bodies are copied verbatim from the prior migrations; only the gate is swapped.

create or replace function public.events_admin_health()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.events_admin_assert_admin();
  return jsonb_build_object('ok', true, 'now', now());
end;
$$;

create or replace function public.events_admin_create(
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz default null,
  p_type text default 'estbirding',
  p_location_name text default null,
  p_lat double precision default null,
  p_lon double precision default null,
  p_url text default null,
  p_description text default null,
  p_image_url text default null,
  p_image_path text default null
)
returns public.events_manual
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.events_manual;
begin
  perform public.events_admin_assert_admin();

  insert into public.events_manual (
    title, starts_at, ends_at, type, location_name, lat, lon, url, description, image_url, image_path, status, updated_at
  )
  values (
    trim(p_title),
    p_starts_at,
    p_ends_at,
    case when lower(coalesce(p_type, '')) = 'muud' then 'muud' else 'estbirding' end,
    nullif(trim(coalesce(p_location_name, '')), ''),
    p_lat,
    p_lon,
    nullif(trim(coalesce(p_url, '')), ''),
    nullif(trim(coalesce(p_description, '')), ''),
    nullif(trim(coalesce(p_image_url, '')), ''),
    nullif(trim(coalesce(p_image_path, '')), ''),
    'active',
    now()
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.events_admin_update(
  p_id uuid,
  p_patch jsonb
)
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
  set
    title = coalesce(nullif(trim(p_patch->>'title'), ''), title),
    starts_at = coalesce((p_patch->>'starts_at')::timestamptz, starts_at),
    ends_at = case
      when p_patch ? 'ends_at' then nullif(p_patch->>'ends_at', '')::timestamptz
      else ends_at
    end,
    type = case
      when p_patch ? 'type' then
        case when lower(coalesce(p_patch->>'type', '')) = 'muud' then 'muud' else 'estbirding' end
      else type
    end,
    location_name = case
      when p_patch ? 'location_name' then nullif(trim(coalesce(p_patch->>'location_name', '')), '')
      else location_name
    end,
    lat = case when p_patch ? 'lat' then nullif(p_patch->>'lat', '')::double precision else lat end,
    lon = case when p_patch ? 'lon' then nullif(p_patch->>'lon', '')::double precision else lon end,
    url = case when p_patch ? 'url' then nullif(trim(coalesce(p_patch->>'url', '')), '') else url end,
    description = case
      when p_patch ? 'description' then nullif(trim(coalesce(p_patch->>'description', '')), '')
      else description
    end,
    image_url = case
      when p_patch ? 'image_url' then nullif(trim(coalesce(p_patch->>'image_url', '')), '')
      else image_url
    end,
    image_path = case
      when p_patch ? 'image_path' then nullif(trim(coalesce(p_patch->>'image_path', '')), '')
      else image_path
    end,
    updated_at = now()
  where id = p_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'event not found';
  end if;

  return v_row;
end;
$$;

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

-- 5. Permissions: restrict to authenticated; the function bodies enforce admin role.
revoke execute on function public.events_admin_health() from anon, authenticated, public;
revoke execute on function public.events_admin_create(text, timestamptz, timestamptz, text, text, double precision, double precision, text, text, text, text) from anon, authenticated, public;
revoke execute on function public.events_admin_update(uuid, jsonb) from anon, authenticated, public;
revoke execute on function public.events_admin_archive(uuid) from anon, authenticated, public;
revoke execute on function public.events_admin_unarchive(uuid) from anon, authenticated, public;
revoke execute on function public.events_admin_delete(uuid) from anon, authenticated, public;

grant execute on function public.events_admin_health() to authenticated;
grant execute on function public.events_admin_create(text, timestamptz, timestamptz, text, text, double precision, double precision, text, text, text, text) to authenticated;
grant execute on function public.events_admin_update(uuid, jsonb) to authenticated;
grant execute on function public.events_admin_archive(uuid) to authenticated;
grant execute on function public.events_admin_unarchive(uuid) to authenticated;
grant execute on function public.events_admin_delete(uuid) to authenticated;

-- 6. Best-effort: clear the no-longer-used GUC for the current session.
do $$
begin
  perform set_config('app.events_admin_key_hash', '', false);
exception when others then
  null;
end $$;

-- 7. Tell PostgREST to reload its schema cache.
notify pgrst, 'reload schema';
