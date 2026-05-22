-- Migration: Convert team_members.branch from TEXT to TEXT[] (array) for multi-branch support
-- ===========================================================================================
-- GOAL: Allow developers to be assigned multiple branches instead of just one.
-- This conversion is backwards-compatible: existing single-branch assignments become single-element arrays.

-- 1. Alter the branch column to use TEXT[] (array of strings)
ALTER TABLE team_members
  ALTER COLUMN branch TYPE TEXT[] USING
    CASE WHEN branch IS NOT NULL THEN ARRAY[branch] ELSE NULL END;

-- 2. Update the column comment to reflect multi-branch support
COMMENT ON COLUMN team_members.branch IS 'Array of branch names this developer can access. Admins can access all branches.';
