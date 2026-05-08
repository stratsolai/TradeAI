-- BI ↔ SP integration columns. Adds the schema needed for the SP/OT
-- Rebuild Spec §11 — tactical/strategic classification on every BI
-- insight, plus the added_to_sp tracking that drives the green
-- "Added" badge in the dashboard and the queue of strategic
-- suggestions surfaced in the SP Update Plan flow.
--
-- Two tables touched:
--   bi_insights — is_tactical, added_to_sp, added_to_sp_at
--   action_tracker — is_tactical, classification_reason
--
-- Run this in the Supabase SQL Editor BEFORE redeploying the matching
-- api/bi-insights.js and api/bi-act.js changes. Without these columns:
--   - bi-insights generation fails its INSERT (extra columns)
--   - bi-act tactical path fails its action_tracker INSERT
--   - bi-act strategic path fails its bi_insights UPDATE
--
-- All columns are nullable / defaulted so existing rows do not need a
-- backfill. The existing RLS policies on both tables already cover
-- the new columns — no policy changes required.

-- ── bi_insights ───────────────────────────────────────────────────
-- is_tactical: classification from the AI during BI generation.
--   true  ⇒ "actionable now, single Operational Task" — Add to Plan
--           creates a task immediately under the most relevant Goal.
--   false ⇒ "needs planning, multiple tasks or new Goal" — Add to
--           Plan queues the item for the next plan update.
ALTER TABLE bi_insights
  ADD COLUMN IF NOT EXISTS is_tactical boolean NOT NULL DEFAULT false;

-- added_to_sp: true once the owner has clicked Add to Plan on this
-- insight. Drives the green "Added" badge that replaces the Add to
-- Plan button so the row stays visible in BI but reads as actioned.
ALTER TABLE bi_insights
  ADD COLUMN IF NOT EXISTS added_to_sp boolean NOT NULL DEFAULT false;

-- added_to_sp_at: timestamp of the Add to Plan click. Nullable —
-- only populated alongside added_to_sp = true.
ALTER TABLE bi_insights
  ADD COLUMN IF NOT EXISTS added_to_sp_at timestamptz;

-- ── action_tracker ────────────────────────────────────────────────
-- is_tactical: copied from the source bi_insights row when a tactical
-- task is created via Add to Plan. Lets the OT tab differentiate
-- BI-sourced tactical tasks from strategic Goals and from manually
-- added tasks.
ALTER TABLE action_tracker
  ADD COLUMN IF NOT EXISTS is_tactical boolean NOT NULL DEFAULT false;

-- classification_reason: the AI's one-sentence explanation of why an
-- insight was tactical vs strategic. Stored alongside the task so the
-- owner can see the reasoning when reviewing the OT tab. Nullable —
-- only populated for rows sourced from a BI tactical add.
ALTER TABLE action_tracker
  ADD COLUMN IF NOT EXISTS classification_reason text;
