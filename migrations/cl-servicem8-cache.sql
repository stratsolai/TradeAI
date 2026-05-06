-- ServiceM8 rate-limit fix — cache servicem8-fetch responses for 15
-- minutes per (user_id, account_email, action). Mirrors cl_xero_cache
-- and cl_quickbooks_cache. The BI dashboard's Refresh Data button
-- bypasses the cache via forceRefresh / bypassCache.
--
-- RLS enabled — only the row's user can read it. The servicem8-fetch
-- endpoint uses the service-role client (bypasses RLS) so writes are
-- not constrained by policy.
--
-- Run this in the Supabase SQL Editor before deploying the matching
-- servicem8-fetch.js change.

CREATE TABLE IF NOT EXISTS cl_servicem8_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  account_email text NOT NULL,
  action text NOT NULL,
  data jsonb NOT NULL,
  cached_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT cl_servicem8_cache_user_account_action_unique UNIQUE (user_id, account_email, action)
);

CREATE INDEX IF NOT EXISTS cl_servicem8_cache_expires_at_idx ON cl_servicem8_cache (expires_at);

ALTER TABLE cl_servicem8_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read their own servicem8 cache rows" ON cl_servicem8_cache
  FOR SELECT USING (auth.uid() = user_id);
