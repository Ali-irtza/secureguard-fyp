-- Migration: 20260520130000_fix_projects_language_nullable.sql
-- Purpose: Make the language column nullable so projects can be created
--          without specifying a language upfront.
--
-- The language column was originally created as NOT NULL with a project_language
-- enum type. Our new service allows language to be optional (NULL).
--
-- Idempotent: safe to run multiple times.

ALTER TABLE public.projects
  ALTER COLUMN language DROP NOT NULL;
