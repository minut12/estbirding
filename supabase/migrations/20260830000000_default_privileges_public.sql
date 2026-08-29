-- M5: new Supabase projects give role postgres a restrictive default ACL in public.
-- Without this, every table created by a future migration is unreachable via PostgREST (42501).

-- WARNING: the statement below does NOT work, and is kept only so the intent is
-- visible next to the grants. Verified empirically on 2026-08-29: after running it,
-- a newly created function still comes out with `=X/postgres` (PUBLIC EXECUTE) in
-- its ACL. PostgreSQL applies its built-in PUBLIC EXECUTE grant for functions on
-- top of pg_default_acl, and this revoke does not suppress it. Re-issuing it after
-- the grants changes nothing, and there are no schema-independent default-ACL rows
-- that could be overriding it.
--
-- CONSEQUENCE: every new SECURITY DEFINER function in this schema MUST carry its
-- own explicit revoke, or anon can call it with the definer's rights:
--     revoke all on function public.<name>(<args>) from public;
-- This is exactly what the old project did — its dump contained five such REVOKEs,
-- one per SECURITY DEFINER function. That pattern is required, not redundant.
alter default privileges for role postgres in schema public revoke execute on functions from public;

alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant execute on functions to authenticated, service_role;
-- anon EXECUTE on functions is granted per function, deliberately (production had 12 of 16).
