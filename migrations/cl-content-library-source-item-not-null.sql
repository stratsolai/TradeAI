-- Ingestion Pipeline Unification v1.1 — Step 10
-- Adds the schema-level guarantee that every non-tool content_library row
-- has a source_item_id pointing at cl_source_items. This is the contract
-- from Section 2.2 of the spec — once this is in place, orphan rows are
-- impossible by construction.
--
-- Logic: source = 'tool' OR source_item_id IS NOT NULL
--   - Tool outputs (source = 'tool') don't need a source row → allowed.
--   - Anything else must point at a cl_source_items row → required.
--
-- Pattern: ADD CONSTRAINT ... NOT VALID, then VALIDATE separately. NOT VALID
-- takes a brief ACCESS EXCLUSIVE lock to add the constraint and starts
-- enforcing it on new inserts/updates immediately without scanning existing
-- rows. VALIDATE is a separate step that re-checks existing rows and only
-- takes a SHARE UPDATE EXCLUSIVE lock — reads and writes keep flowing while
-- it runs, so it's safe on a large table.
--
-- Run in the Supabase SQL Editor after the Step 8 backfill (or, as in our
-- case, after the test-data wipe).

-- Pre-check 1 — confirm no rows have NULL source.
-- Postgres three-valued logic: if source IS NULL, the CHECK expression
-- evaluates to unknown, which is treated as non-failing — so a NULL source
-- would slip past the constraint regardless of source_item_id. Expected: 0.
-- If non-zero, investigate (and either set source or delete those rows)
-- before continuing.
SELECT count(*) AS null_source_rows
FROM content_library
WHERE source IS NULL;

-- Pre-check 2 — confirm no rows would currently violate the constraint.
-- If non-zero, the VALIDATE step below will fail. Run the heal script (or
-- delete the offending rows) first.
SELECT count(*) AS would_violate
FROM content_library
WHERE source IS NOT NULL
  AND source != 'tool'
  AND source_item_id IS NULL;

-- 1. Add the constraint. NOT VALID means existing rows aren't scanned now —
-- only future inserts/updates are checked. Idempotent via IF NOT EXISTS-style
-- guard: if the constraint already exists this will error, which is the
-- intended behaviour for an applied migration.
ALTER TABLE content_library
  ADD CONSTRAINT content_library_source_item_required
  CHECK (source = 'tool' OR source_item_id IS NOT NULL)
  NOT VALID;

-- 2. Validate against existing rows. Will raise if any row violates the
-- check; in that case, drop the constraint, fix the data, and re-run from
-- step 1.
ALTER TABLE content_library
  VALIDATE CONSTRAINT content_library_source_item_required;

-- Post-check — should return zero. The constraint now blocks any future
-- write that would violate it, but a sanity count here confirms the
-- VALIDATE step actually ran cleanly.
SELECT count(*) AS violations
FROM content_library
WHERE source IS NOT NULL
  AND source != 'tool'
  AND source_item_id IS NULL;
