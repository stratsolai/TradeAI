-- Ingestion Pipeline Unification v1.1 — Step 8
-- Backfills cl_source_items.source_unique_key on existing rows using the
-- formats from Section 3 of the spec. Run in the Supabase SQL Editor after
-- the Step 1 migration (which added the column + partial unique index).
--
-- Idempotent: every UPDATE filters on source_unique_key IS NULL, so re-running
-- the script is a no-op for rows that are already keyed.
--
-- Duplicate handling: if legacy data contains more than one row that maps to
-- the same (user_id, computed_key) — e.g. a Gmail message ingested twice —
-- only the OLDEST row by created_at gets the key. The newer duplicates stay
-- NULL so the partial unique index doesn't reject the UPDATE. Those rows can
-- be cleaned up manually after inspecting them.
--
-- Source for each format:
--   gmail              → 'gmail:<gmail_message_id>'
--   gmail attachment   → 'gmail-att:<gmail_message_id>:<attachment_id>'
--   outlook            → 'outlook:<outlook_message_id>'
--   outlook attachment → 'outlook-att:<outlook_message_id>:<attachment_id>'
--   google drive       → 'drive:<drive_file_id>'
--   onedrive           → 'onedrive:<onedrive_item_id>'
--   sharepoint         → 'sharepoint:<site_id>:<sharepoint_item_id>'
--   dropbox            → 'dropbox:<dropbox_file_id>'
--   document upload    → 'upload:<file_url>'
--   photo upload       → 'photo:<file_url>'
--   website            → 'website:<scanTs_ms>:<sha256(fullPageUrl)>'
--                        scanTs is Date.now() in the new code; for legacy rows
--                        we substitute created_at-as-epoch-ms to keep the key
--                        format and uniqueness intact. fullPageUrl strips the
--                        URL fragment, matching buildSourceUniqueKey().

-- pgcrypto provides digest() for the website sha256. Enabled on Supabase by
-- default — this is a no-op if it's already there.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Pre-check: how many rows need backfilling, by source_type ─────────
SELECT source_type, count(*) AS to_backfill
FROM cl_source_items
WHERE source_unique_key IS NULL
GROUP BY source_type
ORDER BY source_type;

-- 1. Gmail email body
WITH winners AS (
  SELECT DISTINCT ON (user_id, source_detail->>'gmail_message_id')
    id,
    source_detail->>'gmail_message_id' AS msg_id
  FROM cl_source_items
  WHERE source_unique_key IS NULL
    AND source_type = 'email'
    AND (source_detail->>'gmail_message_id') IS NOT NULL
  ORDER BY user_id, source_detail->>'gmail_message_id', created_at ASC
)
UPDATE cl_source_items AS si
SET source_unique_key = 'gmail:' || winners.msg_id
FROM winners
WHERE si.id = winners.id;

-- 2. Outlook email body
WITH winners AS (
  SELECT DISTINCT ON (user_id, source_detail->>'outlook_message_id')
    id,
    source_detail->>'outlook_message_id' AS msg_id
  FROM cl_source_items
  WHERE source_unique_key IS NULL
    AND source_type = 'email'
    AND (source_detail->>'outlook_message_id') IS NOT NULL
  ORDER BY user_id, source_detail->>'outlook_message_id', created_at ASC
)
UPDATE cl_source_items AS si
SET source_unique_key = 'outlook:' || winners.msg_id
FROM winners
WHERE si.id = winners.id;

-- 3. Gmail attachment
WITH winners AS (
  SELECT DISTINCT ON (user_id, source_detail->>'gmail_message_id', source_detail->>'attachment_id')
    id,
    source_detail->>'gmail_message_id' AS msg_id,
    source_detail->>'attachment_id' AS att_id
  FROM cl_source_items
  WHERE source_unique_key IS NULL
    AND source_type = 'email-attachment'
    AND (source_detail->>'gmail_message_id') IS NOT NULL
    AND (source_detail->>'attachment_id') IS NOT NULL
  ORDER BY user_id, source_detail->>'gmail_message_id', source_detail->>'attachment_id', created_at ASC
)
UPDATE cl_source_items AS si
SET source_unique_key = 'gmail-att:' || winners.msg_id || ':' || winners.att_id
FROM winners
WHERE si.id = winners.id;

-- 4. Outlook attachment
WITH winners AS (
  SELECT DISTINCT ON (user_id, source_detail->>'outlook_message_id', source_detail->>'attachment_id')
    id,
    source_detail->>'outlook_message_id' AS msg_id,
    source_detail->>'attachment_id' AS att_id
  FROM cl_source_items
  WHERE source_unique_key IS NULL
    AND source_type = 'email-attachment'
    AND (source_detail->>'outlook_message_id') IS NOT NULL
    AND (source_detail->>'attachment_id') IS NOT NULL
  ORDER BY user_id, source_detail->>'outlook_message_id', source_detail->>'attachment_id', created_at ASC
)
UPDATE cl_source_items AS si
SET source_unique_key = 'outlook-att:' || winners.msg_id || ':' || winners.att_id
FROM winners
WHERE si.id = winners.id;

-- 5. Google Drive
WITH winners AS (
  SELECT DISTINCT ON (user_id, source_detail->>'drive_file_id')
    id,
    source_detail->>'drive_file_id' AS file_id
  FROM cl_source_items
  WHERE source_unique_key IS NULL
    AND source_type = 'drive'
    AND (source_detail->>'drive_file_id') IS NOT NULL
  ORDER BY user_id, source_detail->>'drive_file_id', created_at ASC
)
UPDATE cl_source_items AS si
SET source_unique_key = 'drive:' || winners.file_id
FROM winners
WHERE si.id = winners.id;

-- 6. OneDrive
WITH winners AS (
  SELECT DISTINCT ON (user_id, source_detail->>'onedrive_item_id')
    id,
    source_detail->>'onedrive_item_id' AS item_id
  FROM cl_source_items
  WHERE source_unique_key IS NULL
    AND source_type = 'onedrive'
    AND (source_detail->>'onedrive_item_id') IS NOT NULL
  ORDER BY user_id, source_detail->>'onedrive_item_id', created_at ASC
)
UPDATE cl_source_items AS si
SET source_unique_key = 'onedrive:' || winners.item_id
FROM winners
WHERE si.id = winners.id;

-- 7. SharePoint
WITH winners AS (
  SELECT DISTINCT ON (user_id, source_detail->>'site_id', source_detail->>'sharepoint_item_id')
    id,
    source_detail->>'site_id' AS site_id,
    source_detail->>'sharepoint_item_id' AS item_id
  FROM cl_source_items
  WHERE source_unique_key IS NULL
    AND source_type = 'sharepoint'
    AND (source_detail->>'site_id') IS NOT NULL
    AND (source_detail->>'sharepoint_item_id') IS NOT NULL
  ORDER BY user_id, source_detail->>'site_id', source_detail->>'sharepoint_item_id', created_at ASC
)
UPDATE cl_source_items AS si
SET source_unique_key = 'sharepoint:' || winners.site_id || ':' || winners.item_id
FROM winners
WHERE si.id = winners.id;

-- 8. Dropbox
WITH winners AS (
  SELECT DISTINCT ON (user_id, source_detail->>'dropbox_file_id')
    id,
    source_detail->>'dropbox_file_id' AS file_id
  FROM cl_source_items
  WHERE source_unique_key IS NULL
    AND source_type = 'dropbox'
    AND (source_detail->>'dropbox_file_id') IS NOT NULL
  ORDER BY user_id, source_detail->>'dropbox_file_id', created_at ASC
)
UPDATE cl_source_items AS si
SET source_unique_key = 'dropbox:' || winners.file_id
FROM winners
WHERE si.id = winners.id;

-- 9. Document upload (process-file fileType in {pdf, text, html, etc.})
WITH winners AS (
  SELECT DISTINCT ON (user_id, file_url)
    id, file_url
  FROM cl_source_items
  WHERE source_unique_key IS NULL
    AND source_type = 'document'
    AND file_url IS NOT NULL
  ORDER BY user_id, file_url, created_at ASC
)
UPDATE cl_source_items AS si
SET source_unique_key = 'upload:' || winners.file_url
FROM winners
WHERE si.id = winners.id;

-- 10. Photo upload (process-file fileType = 'image')
WITH winners AS (
  SELECT DISTINCT ON (user_id, file_url)
    id, file_url
  FROM cl_source_items
  WHERE source_unique_key IS NULL
    AND source_type = 'photo'
    AND file_url IS NOT NULL
  ORDER BY user_id, file_url, created_at ASC
)
UPDATE cl_source_items AS si
SET source_unique_key = 'photo:' || winners.file_url
FROM winners
WHERE si.id = winners.id;

-- 11. Website (scrape-website pages + process-file 'website' calls)
-- The URL lives in source_detail.url for scrape-website rows and in source_url
-- for process-file rows — COALESCE picks whichever is set. Fragment is stripped
-- before hashing, matching buildSourceUniqueKey() in lib/cl-source-items.js.
-- created_at-as-epoch-ms is the substitute scanTs; this gives unique keys
-- without bumping into the new code's Date.now()-based keys.
WITH winners AS (
  SELECT DISTINCT ON (
    user_id,
    regexp_replace(COALESCE(source_detail->>'url', source_url), '#.*$', '')
  )
    id,
    created_at,
    regexp_replace(COALESCE(source_detail->>'url', source_url), '#.*$', '') AS page_url
  FROM cl_source_items
  WHERE source_unique_key IS NULL
    AND source_type = 'website'
    AND COALESCE(source_detail->>'url', source_url) IS NOT NULL
  ORDER BY
    user_id,
    regexp_replace(COALESCE(source_detail->>'url', source_url), '#.*$', ''),
    created_at ASC
)
UPDATE cl_source_items AS si
SET source_unique_key =
  'website:'
  || (FLOOR(EXTRACT(EPOCH FROM winners.created_at) * 1000))::bigint::text
  || ':'
  || encode(digest(winners.page_url, 'sha256'), 'hex')
FROM winners
WHERE si.id = winners.id;

-- ── Post-check: rows still NULL by source_type ────────────────────────
-- These are rows that didn't have the expected fields in source_detail
-- (e.g. an 'email' row missing both gmail_message_id and outlook_message_id)
-- or were skipped as duplicates by the DISTINCT ON above. Inspect manually
-- before proceeding to the Step 10 NOT NULL CHECK constraint on
-- content_library, as any orphan rows that point to a NULL-key source
-- will need to be heal-script'd or cleaned up first.
SELECT source_type, count(*) AS still_null
FROM cl_source_items
WHERE source_unique_key IS NULL
GROUP BY source_type
ORDER BY source_type;

-- ── Post-check: overall totals ────────────────────────────────────────
SELECT
  count(*)                                        AS total_rows,
  count(*) FILTER (WHERE source_unique_key IS NOT NULL) AS rows_with_key,
  count(*) FILTER (WHERE source_unique_key IS NULL)     AS rows_without_key
FROM cl_source_items;
