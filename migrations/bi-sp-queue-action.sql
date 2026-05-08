-- BI Generated Items queue action — Phase 2 of the SP/OT Rebuild
-- (spec §8.7). When the owner reviews queued strategic items in Tab
-- 9 of the SP wizard they pick one of three actions per item:
--
--   approved — incorporate into the next generated / updated plan
--   held     — leave queued so the next Update cycle still surfaces it
--   rejected — dismiss permanently (the row also gets is_dismissed=true)
--
-- The action is stored on the bi_insights row that the queued item
-- corresponds to, alongside the added_to_sp flag from Phase 1.
--
-- Run this in the Supabase SQL Editor before redeploying the matching
-- strategic-plan-logic.js change.
--
-- All values are NULL until the owner makes a choice — null reads as
-- "still queued, no decision yet" which matches the default state when
-- an insight is first added to the plan.

ALTER TABLE bi_insights
  ADD COLUMN IF NOT EXISTS sp_queue_action text
    CHECK (sp_queue_action IS NULL OR sp_queue_action IN ('approved', 'held', 'rejected'));
