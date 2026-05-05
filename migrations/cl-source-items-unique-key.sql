-- Ingestion Pipeline Unification v1.1 — Step 1
-- Adds source_unique_key to cl_source_items so it can act as the canonical
-- source-of-truth across all 8 ingestion endpoints.
--
-- Non-breaking: column is nullable, and the unique index is partial so existing
-- rows with NULL source_unique_key do not conflict. Safe to run on live data.
-- Run this in the Supabase SQL Editor.

-- 1. Add the column (nullable for now — backfill happens in a later step)
ALTER TABLE cl_source_items
  ADD COLUMN IF NOT EXISTS source_unique_key text;

-- 2. Partial unique index — enforces one row per (user_id, source_unique_key)
--    only when source_unique_key is set. NULLs are ignored, so existing rows
--    without a key are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS cl_source_items_user_source_unique_key_idx
  ON cl_source_items (user_id, source_unique_key)
  WHERE source_unique_key IS NOT NULL;
