-- 1. Force-drop every plausible old key-based signature
drop function if exists public.events_admin_health(text);
drop function if exists public.events_admin_create(text, text, timestamptz, timestamptz, text, text, double precision, double precision, text, text);
drop function if exists public.events_admin_create(text, text, timestamptz, timestamptz, text, text, double precision, double precision, text, text, text, text);
drop function if exists public.events_admin_update(text, uuid, jsonb);
drop function if exists public.events_admin_archive(text, uuid);
drop function if exists public.events_admin_unarchive(text, uuid);
drop function if exists public.events_admin_delete(text, uuid);

-- 2. Drop archive/unarchive entirely (feature removed) — any auth-gated variants too
drop function if exists public.events_admin_archive(uuid);
drop function if exists public.events_admin_unarchive(uuid);

-- 3. Drop bcrypt verification helpers (no longer used)
drop function if exists public._events_admin_bootstrap_or_check(text);
drop function if exists public.events_admin_assert_key(text);
drop function if exists public.events_admin_expected_key_hash();
drop function if exists public.events_admin_require_pgcrypto();

-- 4. Helper: assert the calling user is an authenticated admin
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

-- 5. Recreate the RPCs (no admin_key, auth-gated)

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
  p_ends_at timestamptz,
  p_type text,
  p_location_name text,
  p_lat double precision,
  p_lon double precision,
  p_url text,
  p_description text,
  p_image_url text,
  p_image_path text
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

  if coalesce(trim(p_title), '') = '' then
    raise exception 'title required';
  end if;
  if p_starts_at is null then
    raise exception 'starts_at required';
  end if;
  if p_type not in ('estbirding', 'muud') then
    raise exception 'invalid type';
  end if;

  insert into public.events_manual (
    title, starts_at, ends_at, type, location_name, lat, lon, url, description, image_url, image_path, status
  ) values (
    trim(p_title), p_starts_at, p_ends_at, p_type, nullif(trim(coalesce(p_location_name, '')), ''),
    p_lat, p_lon, nullif(trim(coalesce(p_url, '')), ''), nullif(trim(coalesce(p_description, '')), ''),
    p_image_url, p_image_path, 'active'
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.events_admin_update(p_id uuid, p_patch jsonb)
returns public.events_manual
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.events_manual;
  v_allowed text[] := array[
    'title','starts_at','ends_at','type','location_name','lat','lon','url','description','image_url','image_path','status'
  ];
  v_set_clauses text := '';
  v_key text;
  v_value jsonb;
begin
  perform public.events_admin_assert_admin();

  if p_id is null then
    raise exception 'id required';
  end if;

  for v_key, v_value in select * from jsonb_each(p_patch) loop
    if v_key = any(v_allowed) then
      if v_set_clauses <> '' then
        v_set_clauses := v_set_clauses || ', ';
      end if;
      v_set_clauses := v_set_clauses || quote_ident(v_key) || ' = ' || quote_nullable(
        case
          when jsonb_typeof(v_value) = 'null' then null
          else v_value #>> '{}'
        end
      );
    end if;
  end loop;

  if v_set_clauses = '' then
    select * into v_row from public.events_manual where id = p_id;
    return v_row;
  end if;

  execute format('update public.events_manual set %s, updated_at = now() where id = $1 returning *', v_set_clauses)
    using p_id
    into v_row;

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
  return v_row;
end;
$$;

-- 6. Permissions
revoke execute on function public.events_admin_health() from anon, authenticated, public;
revoke execute on function public.events_admin_create(text, timestamptz, timestamptz, text, text, double precision, double precision, text, text, text, text) from anon, authenticated, public;
revoke execute on function public.events_admin_update(uuid, jsonb) from anon, authenticated, public;
revoke execute on function public.events_admin_delete(uuid) from anon, authenticated, public;

grant execute on function public.events_admin_health() to authenticated;
grant execute on function public.events_admin_create(text, timestamptz, timestamptz, text, text, double precision, double precision, text, text, text, text) to authenticated;
grant execute on function public.events_admin_update(uuid, jsonb) to authenticated;
grant execute on function public.events_admin_delete(uuid) to authenticated;

-- 7. Force PostgREST schema cache reload
notify pgrst, 'reload schema';