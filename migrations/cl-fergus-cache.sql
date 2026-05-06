-- Fergus rate-limit fix — cache fergus-fetch responses for 15 minutes
-- per (user_id, account_name, action). Mirrors cl_xero_cache,
-- cl_quickbooks_cache and cl_servicem8_cache. The BI dashboard's
-- Refresh Data button bypasses the cache via forceRefresh / bypassCache.
--
-- RLS enabled — only the row's user can read it. The fergus-fetch
-- endpoint uses the service-role client (bypasses RLS) so writes are
-- not constrained by policy.
--
-- Run this in the Supabase SQL Editor before deploying the matching
-- fergus-fetch.js change.

CREATE TABLE IF NOT EXISTS cl_fergus_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  account_name text NOT NULL,
  action text NOT NULL,
  data jsonb NOT NULL,
  cached_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT cl_fergus_cache_user_account_action_unique UNIQUE (user_id, account_name, action)
);

CREATE INDEX IF NOT EXISTS cl_fergus_cache_expires_at_idx ON cl_fergus_cache (expires_at);

ALTER TABLE cl_fergus_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read their own fergus cache rows" ON cl_fergus_cache
  FOR SELECT USING (auth.uid() = user_id);
