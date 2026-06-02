-- Migration: Add GitHub repository columns to the projects table
-- These columns mirror the teams table (github_repo, github_branches),
-- enabling personal projects to connect a GitHub repository just like team projects.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS github_repo text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS github_branches text[] DEFAULT '{}';
