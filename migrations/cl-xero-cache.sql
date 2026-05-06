-- Xero rate-limit fix — cache xero-fetch responses for 15 minutes per
-- (user_id, tenant_id, action) so the same data is not pulled multiple
-- times during a single BI dashboard load and is not pulled fresh on
-- every load. The Refresh Data button bypasses this cache.
--
-- RLS is enabled — only the row's user can read it. The xero-fetch
-- endpoint uses the service-role client (bypasses RLS) so writes are
-- not constrained by policy.
--
-- Run this in the Supabase SQL Editor before deploying the matching
-- xero-fetch.js change.

CREATE TABLE IF NOT EXISTS cl_xero_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  tenant_id text NOT NULL,
  action text NOT NULL,
  data jsonb NOT NULL,
  cached_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT cl_xero_cache_user_tenant_action_unique UNIQUE (user_id, tenant_id, action)
);

CREATE INDEX IF NOT EXISTS cl_xero_cache_expires_at_idx ON cl_xero_cache (expires_at);

ALTER TABLE cl_xero_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read their own xero cache rows" ON cl_xero_cache
  FOR SELECT USING (auth.uid() = user_id);
