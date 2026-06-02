-- Migration: Add github_installation_id to projects table
-- Required for GitHub App OAuth flow on personal projects,
-- mirroring the teams table column of the same name.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS github_installation_id bigint DEFAULT NULL;
