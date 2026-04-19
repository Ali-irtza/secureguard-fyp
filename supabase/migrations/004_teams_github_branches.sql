-- =============================================================================
-- Migration 004: Add github_branches to teams
-- =============================================================================
-- Why TEXT[] (array)?
--   A team repo can have many branches. Storing them as a PostgreSQL array
--   keeps it in one column, no extra join table needed for a simple list.
--   We refresh this list on demand (user clicks "Refresh Branches").
--
-- Why NOT store the PAT?
--   PATs are sensitive credentials. We use them once to call the GitHub API,
--   fetch the branch list, then discard. Never persisted. Option B pattern.
-- =============================================================================

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS github_branches TEXT[] DEFAULT '{}';
