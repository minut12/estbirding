delete from public.role_permissions
where role = 'user_level_1'
  and permission_key in ('maps.view.ee', 'maps.view.eu');
