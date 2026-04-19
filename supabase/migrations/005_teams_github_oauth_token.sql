-- =============================================================================
-- Migration 005: Store GitHub OAuth access token on teams
-- =============================================================================
-- Why store the token?
--   Unlike the PAT flow (Option B, use-once-discard), OAuth tokens are
--   long-lived and reusable. We store them so we can:
--     - Fetch branches on demand without asking the user again
--     - (Future) Listen to webhooks and verify payloads
--     - (Future) Auto-refresh branches when a push event arrives
--
-- Security:
--   - Column is TEXT — Supabase encrypts data at rest (AES-256)
--   - RLS is enabled on teams table — only team members can read their team
--   - The token is NEVER returned to the frontend (excluded from API responses)
--   - Backend reads it server-side only, using service_role key
--
-- Why nullable?
--   Teams that haven't connected GitHub yet have NULL here.
--   Teams using the old PAT flow also have NULL (they can re-connect via OAuth).
-- =============================================================================

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS github_oauth_token TEXT DEFAULT NULL;
