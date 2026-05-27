-- Add admin-only permissions for the three new USA maps.
-- Maps: Colorado (US-CO), Pennsylvania (US-PA), USA I-70 Route (CO/KS/MO/IL/IN/OH/PA).
-- These are temporary maps for a US birding trip. Admin-only by design.

insert into public.role_permissions (role, permission_key) values
  ('admin', 'maps.view.usa.co'),
  ('admin', 'maps.view.usa.pa'),
  ('admin', 'maps.view.usa.i70')
on conflict (role, permission_key) do nothing;