-- Helper RPC consumed by lib/supplier-usage.js readSupabaseUsage.
-- Returns the current database's on-disk size in bytes so the Admin
-- Profitability Supabase card can show "<used> GB / 8 GB" against the
-- Pro plan's 8 GB included limit.
--
-- Marked SECURITY DEFINER so the supabase JS client (using the
-- service-role key in admin endpoints) can call it. Granted to
-- authenticated as well — admin-profitability checks is_admin before
-- calling, but RLS on the upstream table blocks non-admin reads.

CREATE OR REPLACE FUNCTION get_db_size()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT pg_database_size(current_database())::bigint;
$$;

GRANT EXECUTE ON FUNCTION get_db_size() TO service_role, authenticated;
