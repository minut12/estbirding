-- P181b: endpoint-keyed push subscription RPCs. Knowing the endpoint (an
-- unguessable push-service URL) is the credential, so a caller can only read
-- or change its own row. The open table policies are dropped in P181c, after
-- the app, map iframe and service worker use these RPCs in production.

-- The sender is the only caller of this one, and it uses service_role.
revoke execute on function public.get_subscriptions_for_species(text[]) from public, anon, authenticated;
grant execute on function public.get_subscriptions_for_species(text[]) to service_role;

create or replace function public._push_endpoint_ok(p_endpoint text)
returns boolean language sql immutable set search_path = public as $$
  select p_endpoint is not null and p_endpoint ~ '^https://' and length(p_endpoint) <= 1024
$$;

create or replace function public.push_sub_get(p_endpoint text)
returns table(endpoint text, subscribed_species text[], device_label text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.endpoint, s.subscribed_species, s.device_label, s.updated_at
  from public.push_subscriptions s
  where public._push_endpoint_ok(p_endpoint) and s.endpoint = p_endpoint
$$;

-- p_species null = keep the stored list (or empty for a new row).
create or replace function public.push_sub_upsert(
  p_endpoint text, p_p256dh text, p_auth text,
  p_species text[] default null, p_device_label text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._push_endpoint_ok(p_endpoint) then raise exception 'invalid endpoint'; end if;
  if coalesce(p_p256dh,'') = '' or coalesce(p_auth,'') = '' or length(p_p256dh) > 256 or length(p_auth) > 256 then
    raise exception 'invalid keys';
  end if;
  if p_species is not null and cardinality(p_species) > 3000 then raise exception 'too many species'; end if;
  insert into public.push_subscriptions as s (endpoint, key_p256dh, key_auth, subscribed_species, device_label, updated_at)
  values (p_endpoint, p_p256dh, p_auth, coalesce(p_species, '{}'), left(coalesce(p_device_label, ''), 120), now())
  on conflict (endpoint) do update set
    key_p256dh = excluded.key_p256dh,
    key_auth = excluded.key_auth,
    subscribed_species = coalesce(p_species, s.subscribed_species),
    device_label = coalesce(left(p_device_label, 120), s.device_label),
    updated_at = now();
end $$;

create or replace function public.push_sub_delete(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where public._push_endpoint_ok(p_endpoint) and endpoint = p_endpoint
$$;

-- Browser rotated the subscription: carry the species list from the old row
-- to the new endpoint, then drop the old row. Caller must know both endpoints.
create or replace function public.push_sub_rotate(
  p_old_endpoint text, p_endpoint text, p_p256dh text, p_auth text, p_device_label text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_species text[];
begin
  if p_old_endpoint is not null and public._push_endpoint_ok(p_old_endpoint) then
    select subscribed_species into v_species from public.push_subscriptions where endpoint = p_old_endpoint;
  end if;
  perform public.push_sub_upsert(p_endpoint, p_p256dh, p_auth, v_species, p_device_label);
  if p_old_endpoint is not null and p_old_endpoint <> p_endpoint then
    delete from public.push_subscriptions where endpoint = p_old_endpoint;
  end if;
end $$;

create or replace function public.admin_list_push_subscriptions()
returns table(endpoint text, subscribed_species_count int, device_label text, updated_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'forbidden'; end if;
  return query select left(s.endpoint, 60), cardinality(s.subscribed_species), s.device_label, s.updated_at
    from public.push_subscriptions s order by s.updated_at desc;
end $$;

revoke all on function public._push_endpoint_ok(text) from public;
revoke all on function public.push_sub_get(text) from public;
revoke all on function public.push_sub_upsert(text,text,text,text[],text) from public;
revoke all on function public.push_sub_delete(text) from public;
revoke all on function public.push_sub_rotate(text,text,text,text,text) from public;
revoke all on function public.admin_list_push_subscriptions() from public, anon;
grant execute on function public.push_sub_get(text), public.push_sub_upsert(text,text,text,text[],text),
  public.push_sub_delete(text), public.push_sub_rotate(text,text,text,text,text) to anon, authenticated, service_role;
grant execute on function public.admin_list_push_subscriptions() to authenticated;