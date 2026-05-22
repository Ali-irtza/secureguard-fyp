-- Migration: 004_create_project_files_table.sql
-- Purpose: Create public.project_files to track every file stored in the
--          project-files storage bucket. Previously, file metadata lived
--          only as custom headers on storage objects (no SQL queryability,
--          no realtime, no audit trail). This table is the source of truth
--          for listing, realtime sync, and future scan references.
--
-- Storage objects are NOT removed — the bucket still holds the actual bytes.
-- This table is the metadata index on top of it.
--
-- Schema:
--   project_files.project_id   → public.projects.id   (CASCADE delete)
--   project_files.uploaded_by  → auth.users.id         (SET NULL on user delete)
--
-- RLS visibility:
--   SELECT: project owner OR team member of the project's team
--   INSERT: project owner OR team admin/developer of the project's team
--   DELETE: project owner only
--
-- Idempotent: safe to run multiple times.

-- ============================================================
-- SECTION 1: Create the table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.project_files (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  uploaded_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  filename       TEXT        NOT NULL,
  storage_path   TEXT        NOT NULL,          -- "{project_id}/{filename}"
  size           BIGINT      NOT NULL DEFAULT 0,
  content_type   TEXT        NOT NULL DEFAULT 'application/octet-stream',
  source         TEXT        NOT NULL DEFAULT 'local' CHECK (source IN ('local', 'github')),
  github_branch  TEXT,                          -- NULL for local uploads
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Prevent duplicate filenames per project (upsert semantics)
  UNIQUE (project_id, filename)
);

-- ============================================================
-- SECTION 2: Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_project_files_project_id
  ON public.project_files (project_id);

CREATE INDEX IF NOT EXISTS idx_project_files_uploaded_by
  ON public.project_files (uploaded_by);

-- ============================================================
-- SECTION 3: Add to supabase_realtime publication
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname    = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'project_files'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_files;
  END IF;
END $$;

-- ============================================================
-- SECTION 4: Enable Row-Level Security
-- ============================================================

ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SECTION 5: RLS policies
-- ============================================================

-- SELECT: project owner OR any team member of the project's team
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'project_files'
      AND policyname = 'project_files_select_policy'
  ) THEN
    CREATE POLICY project_files_select_policy
      ON public.project_files
      FOR SELECT
      USING (
        -- Direct project owner
        (SELECT owner_id FROM public.projects WHERE id = project_id) = auth.uid()
        OR
        -- Any member of the project's team
        (SELECT team_id FROM public.projects WHERE id = project_id) IN (
          SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- INSERT: project owner OR team admin/developer
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'project_files'
      AND policyname = 'project_files_insert_policy'
  ) THEN
    CREATE POLICY project_files_insert_policy
      ON public.project_files
      FOR INSERT
      WITH CHECK (
        -- Direct project owner
        (SELECT owner_id FROM public.projects WHERE id = project_id) = auth.uid()
        OR
        -- Team admin or developer
        EXISTS (
          SELECT 1
          FROM   public.team_members tm
          JOIN   public.projects     p  ON p.team_id = tm.team_id
          WHERE  p.id        = project_id
            AND  tm.user_id  = auth.uid()
            AND  tm.role    IN ('admin', 'developer')
        )
      );
  END IF;
END $$;

-- DELETE: project owner only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'project_files'
      AND policyname = 'project_files_delete_policy'
  ) THEN
    CREATE POLICY project_files_delete_policy
      ON public.project_files
      FOR DELETE
      USING (
        (SELECT owner_id FROM public.projects WHERE id = project_id) = auth.uid()
      );
  END IF;
END $$;
