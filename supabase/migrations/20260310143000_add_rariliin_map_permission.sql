insert into public.role_permissions (role, permission_key) values
  ('admin', 'maps.view.rariliin'),
  ('user_level_2', 'maps.view.rariliin'),
  ('user_level_1', 'maps.view.rariliin')
on conflict (role, permission_key) do nothing;
