insert into public.role_permissions (role, permission_key) values
  ('admin', 'news.archive'),
  ('admin', 'settings.manage'),
  ('admin', 'settings.links.admin'),
  ('admin', 'kevadranne.edit'),
  ('admin', 'species.edit'),
  ('admin', 'roles.manage'),
  ('user_level_1', 'maps.view.eu')
on conflict (role, permission_key) do nothing;
