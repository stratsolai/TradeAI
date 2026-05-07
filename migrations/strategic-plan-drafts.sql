-- Strategic Plan draft storage. Replaces the previous localStorage
-- draft so users see in-progress interview answers across devices.
--
-- One row per user (UNIQUE on user_id). The Create/Update Plan tab
-- upserts on every debounced autosave (500ms after the last edit)
-- and deletes on successful Generate.
--
-- RLS is enabled — users can only read/write/delete their own row.
-- The SP page calls Supabase from the browser using the user's
-- session token via the anon-key client, so the policies below are
-- the authorisation surface.
--
-- Run this in the Supabase SQL Editor before deploying the matching
-- strategic-plan-logic.js change.

CREATE TABLE IF NOT EXISTS strategic_plan_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  draft_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT strategic_plan_drafts_user_unique UNIQUE (user_id)
);

ALTER TABLE strategic_plan_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can select their own draft" ON strategic_plan_drafts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users can insert their own draft" ON strategic_plan_drafts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can update their own draft" ON strategic_plan_drafts
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can delete their own draft" ON strategic_plan_drafts
  FOR DELETE USING (auth.uid() = user_id);

-- Auto-bump updated_at on row update so a draft's last-saved time
-- is always current. created_at stays at the original insert time.
CREATE OR REPLACE FUNCTION strategic_plan_drafts_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS strategic_plan_drafts_updated_at ON strategic_plan_drafts;
CREATE TRIGGER strategic_plan_drafts_updated_at
  BEFORE UPDATE ON strategic_plan_drafts
  FOR EACH ROW
  EXECUTE FUNCTION strategic_plan_drafts_set_updated_at();
