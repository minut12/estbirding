-- TEMP: allow any authenticated user to read ALL events (for manage UI)
drop policy if exists "events_auth_select_all_temp" on public.events;
create policy "events_auth_select_all_temp"
on public.events for select
to authenticated
using (true);

-- TEMP: allow any authenticated user to insert events
drop policy if exists "events_auth_insert_temp" on public.events;
create policy "events_auth_insert_temp"
on public.events for insert
to authenticated
with check (true);

-- TEMP: allow any authenticated user to update events
drop policy if exists "events_auth_update_temp" on public.events;
create policy "events_auth_update_temp"
on public.events for update
to authenticated
using (true)
with check (true);

-- TEMP: allow any authenticated user to delete events (optional)
drop policy if exists "events_auth_delete_temp" on public.events;
create policy "events_auth_delete_temp"
on public.events for delete
to authenticated
using (true);
