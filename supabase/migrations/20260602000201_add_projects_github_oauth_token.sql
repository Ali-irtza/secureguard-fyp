-- Migration: Add github_oauth_token to projects table
-- Used transiently during the GitHub App OAuth flow to store the pending
-- CSRF token (cleared after the callback succeeds).

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS github_oauth_token text DEFAULT NULL;
