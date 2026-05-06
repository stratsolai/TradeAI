-- QuickBooks rate-limit fix — cache quickbooks-fetch responses for 15
-- minutes per (user_id, realm_id, action). Mirrors cl_xero_cache. The
-- BI dashboard's Refresh Data button bypasses the cache via
-- forceRefresh / bypassCache.
--
-- RLS enabled — only the row's user can read it. The quickbooks-fetch
-- endpoint uses the service-role client (bypasses RLS) so writes are
-- not constrained by policy.
--
-- Run this in the Supabase SQL Editor before deploying the matching
-- quickbooks-fetch.js change.

CREATE TABLE IF NOT EXISTS cl_quickbooks_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  realm_id text NOT NULL,
  action text NOT NULL,
  data jsonb NOT NULL,
  cached_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT cl_quickbooks_cache_user_realm_action_unique UNIQUE (user_id, realm_id, action)
);

CREATE INDEX IF NOT EXISTS cl_quickbooks_cache_expires_at_idx ON cl_quickbooks_cache (expires_at);

ALTER TABLE cl_quickbooks_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read their own quickbooks cache rows" ON cl_quickbooks_cache
  FOR SELECT USING (auth.uid() = user_id);
