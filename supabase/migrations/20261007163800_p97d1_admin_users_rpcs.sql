-- p97d1_admin_users_rpcs.sql
-- P97d1: admin-only user list (with last sign-in) + atomic role change with guards.
-- Both functions call events_admin_assert_admin() first (not signed in / not admin -> 42501).

-- 1) User list for Seaded > Kasutajad. Highest role per user (admin > user_level_2 > user_level_1),
--    default user_level_1 when a profile has no role row. last_sign_in_at comes from auth.users,
--    which the client cannot read directly.
create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  display_name text,
  status text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  role public.app_role
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public.events_admin_assert_admin();
  return query
  select
    p.id,
    p.email,
    p.display_name,
    p.status,
    p.created_at,
    u.last_sign_in_at,
    coalesce(
      (select r.role
         from public.user_roles r
        where r.user_id = p.id
        order by case r.role when 'admin' then 0 when 'user_level_2' then 1 else 2 end
        limit 1),
      'user_level_1'::public.app_role
    )
  from public.profiles p
  left join auth.users u on u.id = p.id
  order by p.created_at desc;
end;
$$;

revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

-- 2) Set a user's role in one transaction. Replaces all role rows of that user with exactly one.
--    Guards: not your own role; target must have a profile; never leave zero admins
--    (advisory lock so two admins can't demote each other at the same moment).
create or replace function public.admin_set_user_role(p_user_id uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.events_admin_assert_admin();
  if p_user_id is null or p_role is null then
    raise exception 'user and role are required' using errcode = '22004';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'cannot change own role' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.admin_set_user_role'));
  if p_role <> 'admin'
     and public.has_role(p_user_id, 'admin')
     and (select count(distinct user_id) from public.user_roles where role = 'admin') <= 1 then
    raise exception 'cannot remove the last admin' using errcode = '42501';
  end if;

  delete from public.user_roles where user_id = p_user_id;
  insert into public.user_roles (user_id, role) values (p_user_id, p_role);
end;
$$;

revoke all on function public.admin_set_user_role(uuid, public.app_role) from public, anon;
grant execute on function public.admin_set_user_role(uuid, public.app_role) to authenticated;
