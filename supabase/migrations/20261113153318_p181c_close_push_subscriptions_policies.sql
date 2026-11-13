-- P181c: push_subscriptions is reached only through the endpoint-keyed
-- SECURITY DEFINER RPCs from P181b (push_sub_get/upsert/delete/rotate,
-- admin_list_push_subscriptions). Drop the open anon/authenticated policies;
-- service_role_all_push_sub stays for the push edge functions.
drop policy if exists anon_delete_push_sub on public.push_subscriptions;
drop policy if exists anon_insert_push_sub on public.push_subscriptions;
drop policy if exists anon_select_push_sub on public.push_subscriptions;
drop policy if exists anon_update_push_sub on public.push_subscriptions;
drop policy if exists auth_delete_push_sub on public.push_subscriptions;
drop policy if exists auth_insert_push_sub on public.push_subscriptions;
drop policy if exists auth_select_push_sub on public.push_subscriptions;
drop policy if exists auth_update_push_sub on public.push_subscriptions;