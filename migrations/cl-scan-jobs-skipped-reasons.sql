-- Ingestion Pipeline Unification v1.1 — Section 5.3
-- Adds a skipped_reasons jsonb column to cl_scan_jobs so the per-scan
-- skipped breakdown returned by ingestion endpoints (e.g.
-- { source_row_failed: 3, no_content: 7, attachment_oversized: 1 }) can
-- be persisted alongside the existing skipped_count total. The Admin
-- page Error Monitor reads this column to surface source_row_failed
-- counts and alert when ingestion failures spike.
--
-- Non-breaking: column allows '{}'::jsonb default and isn't referenced
-- by anything until the matching scan-worker change ships.

ALTER TABLE cl_scan_jobs
  ADD COLUMN IF NOT EXISTS skipped_reasons jsonb NOT NULL DEFAULT '{}'::jsonb;
