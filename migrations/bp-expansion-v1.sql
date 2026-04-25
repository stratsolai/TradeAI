-- BP Expansion Spec v1.0 — Database Migration
-- Run this in Supabase SQL Editor before deploying the code changes.
-- Safe to run on existing data — all changes are additive or use USING clauses.

-- Task 1: Convert profiles.industry from text to text[]
ALTER TABLE profiles ALTER COLUMN industry TYPE text[] USING
  CASE WHEN industry IS NULL THEN NULL
       ELSE ARRAY[industry]
  END;

-- Panel 2: Location & Contact — new fields
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS service_area text[] DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trading_hours jsonb DEFAULT '[]';

-- Panel 3: Services — structured service rows
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bp_services jsonb DEFAULT '[]';

-- Panel 4: Products — structured product rows
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bp_products jsonb DEFAULT '[]';

-- Panel 5: Credentials & Support — new fields
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS licences text[] DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payment_methods text[] DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS response_time text DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS warranty_info text DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS complaints_handling text DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS after_hours_support jsonb DEFAULT '{"type":"","hours_text":""}';
