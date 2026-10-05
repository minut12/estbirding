-- P92c: allow type 'eoy' (EOÜ). Live DB had NO check constraint on type (repo file 20260227094500 claims one); add it now.
alter table public.events_manual
  drop constraint if exists events_manual_type_check;
alter table public.events_manual
  add constraint events_manual_type_check check (type in ('estbirding', 'eoy', 'muud'));

create or replace function public.events_admin_create(
  p_title text, p_starts_at timestamptz, p_ends_at timestamptz, p_type text,
  p_location_name text, p_lat double precision, p_lon double precision,
  p_url text, p_description text, p_image_url text, p_image_path text
) returns public.events_manual
language plpgsql security definer set search_path = public
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
  if p_type not in ('estbirding', 'eoy', 'muud') then
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
