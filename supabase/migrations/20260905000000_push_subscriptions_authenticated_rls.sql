-- M7.5 C4: push_subscriptions RLS covered only anon + service_role; logged-in users (authenticated) got 42501 on the subscribe upsert, so no subscription ever landed on the new project. Mirrors the existing anon policies. Tightening both is an M7.8 item.
create policy auth_insert_push_sub on public.push_subscriptions for insert to authenticated with check (true);
create policy auth_select_push_sub on public.push_subscriptions for select to authenticated using (true);
create policy auth_update_push_sub on public.push_subscriptions for update to authenticated using (true) with check (true);
create policy auth_delete_push_sub on public.push_subscriptions for delete to authenticated using (true);
