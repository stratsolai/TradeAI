-- Adds a per-post last_metrics_refresh timestamp so social-metrics-refresh
-- can apply tiered refresh frequencies (daily for posts 0-7 days old,
-- weekly for posts 8-30 days old) instead of re-fetching every published
-- post in the last 30 days on every cron tick.
--
-- Run this in the Supabase SQL Editor before deploying the matching
-- social-metrics-refresh.js change.

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS last_metrics_refresh timestamptz;

CREATE INDEX IF NOT EXISTS social_posts_last_metrics_refresh_idx
  ON social_posts (last_metrics_refresh);
