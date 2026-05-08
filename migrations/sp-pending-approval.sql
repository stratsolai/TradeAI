-- SP/OT Rebuild Phase 3 (spec §6) — Strategic Plan now lands in a
-- "pending_approval" state when first generated. The Review &
-- Approval screen shows the draft to the owner, who can edit it
-- (via AI chat for Goals, inline for Tasks), then Approve or
-- Discard. Approve flips the plan to active and reveals the
-- generated tasks in the Operational Tasks tab; Discard deletes
-- the pending row.
--
-- Two columns added:
--
-- strategic_plans.status — three states:
--   pending_approval — generated, sitting in the Review screen
--   active           — owner approved, this is the current plan
--   archived         — superseded by a newer plan
-- The is_current boolean still flags the live plan; status adds the
-- pending state so the Review screen knows whether a plan is up
-- for approval.
--
-- action_tracker.is_pending — true while the parent plan is still
-- pending_approval. The Operational Tasks tab filters these out
-- so a draft plan's tasks don't leak into OT before approval.
-- Approve flips this to false on every row tied to the plan.
--
-- Run this in the Supabase SQL Editor BEFORE redeploying the
-- matching api/strategic-plan-generate.js + new
-- api/strategic-plan-approve.js. Without it the inserts will fail
-- with "column does not exist".

ALTER TABLE strategic_plans
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending_approval', 'active', 'archived'));

ALTER TABLE action_tracker
  ADD COLUMN IF NOT EXISTS is_pending boolean NOT NULL DEFAULT false;
