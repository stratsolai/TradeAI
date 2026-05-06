-- Adds the unique constraint refreshSupabaseLimits in
-- api/admin-profitability.js relies on for its upsert
-- (onConflict: 'provider,limit_type'). Idempotent — does nothing
-- if a matching constraint already exists.
--
-- Run this in the Supabase SQL Editor before deploying the
-- supplier-usage Item 9 change. If supplier_limits already has a
-- different conflict resolution strategy in production, drop the
-- existing constraint first.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'supplier_limits_provider_limit_type_unique'
  ) THEN
    ALTER TABLE supplier_limits
      ADD CONSTRAINT supplier_limits_provider_limit_type_unique
      UNIQUE (provider, limit_type);
  END IF;
END$$;
