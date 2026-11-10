-- Revoke EXECUTE on SECURITY DEFINER functions from anon/authenticated/public
-- Keep has_role executable by authenticated (required for RLS role checks)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- Hide the GraphQL schema from anon and authenticated so pg_graphql does not
-- expose tables through the public/anon GraphQL endpoint. The app uses PostgREST
-- (Data API) which is unaffected; RLS continues to protect REST access.
REVOKE USAGE ON SCHEMA graphql FROM anon, authenticated;
REVOKE USAGE ON SCHEMA graphql_public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql_public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql FROM anon, authenticated;