insert into public.role_permissions (role, permission_key)
values
  ('admin', 'news.archive'),
  ('admin', 'kevadranne.edit'),
  ('user_level_1', 'maps.view.eu')
on conflict (role, permission_key) do nothing;

drop policy if exists "linnuliigid_spring_dates_write" on public.linnuliigid_spring_dates;
drop policy if exists "Anyone can insert spring dates" on public.linnuliigid_spring_dates;
drop policy if exists "Anyone can update spring dates" on public.linnuliigid_spring_dates;
drop policy if exists "Anyone can delete spring dates" on public.linnuliigid_spring_dates;

create policy "Spring dates insert by editor"
on public.linnuliigid_spring_dates
for insert
to authenticated
with check (public.has_permission(auth.uid(), 'kevadranne.edit'));

create policy "Spring dates update by editor"
on public.linnuliigid_spring_dates
for update
to authenticated
using (public.has_permission(auth.uid(), 'kevadranne.edit'))
with check (public.has_permission(auth.uid(), 'kevadranne.edit'));

create policy "Spring dates delete by editor"
on public.linnuliigid_spring_dates
for delete
to authenticated
using (public.has_permission(auth.uid(), 'kevadranne.edit'));
