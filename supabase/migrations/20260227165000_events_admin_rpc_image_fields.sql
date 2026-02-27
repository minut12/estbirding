create or replace function public.events_admin_create(
  admin_key text,
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
  perform public.events_admin_assert_key(admin_key);

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
  admin_key text,
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
  perform public.events_admin_assert_key(admin_key);

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

grant execute on function public.events_admin_create(
  text, text, timestamptz, timestamptz, text, text, double precision, double precision, text, text, text, text
) to anon, authenticated;
