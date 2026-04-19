-- =============================================================================
-- Migration 006: Add github_installation_id to teams
-- =============================================================================
-- Why installation_id?
--   GitHub Apps authenticate per-installation, not per-user.
--   When a user installs our GitHub App on their account/org, GitHub assigns
--   a unique installation_id. We use this to get an installation access token
--   (read-only, scoped to repos the user selected) without storing any secret.
--
-- Flow:
--   1. User clicks "Connect with GitHub" → redirected to GitHub App install page
--   2. User selects repos → GitHub redirects to our callback with installation_id
--   3. We store installation_id in this column
--   4. On demand: we use installation_id + our private key to get a fresh token
--   5. Token used to fetch branches, then discarded — never stored
-- =============================================================================

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS github_installation_id BIGINT DEFAULT NULL;
