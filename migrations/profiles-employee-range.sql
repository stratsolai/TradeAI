-- Adds the employee_range column on profiles that BP's new Team Size
-- field saves to and that SP, BI insights, and BI chat already read
-- from. Idempotent — IF NOT EXISTS so safe to run regardless of
-- whether the column already exists in production.
--
-- Allowed values are enforced in the BP UI dropdown, not at the
-- database level, so the column stays free-form text. Existing
-- consumers (api/bi-insights.js, api/bi-chat.js, SP) already treat
-- it as an opaque string.
--
-- Run this in the Supabase SQL Editor before deploying the matching
-- cl-profile.js / strategic-plan-data.js change.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS employee_range text DEFAULT '';
