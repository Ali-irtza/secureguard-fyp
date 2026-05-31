-- Align database schema with the current scanner implementation.

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS branches TEXT[] DEFAULT '{}';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'team_members'
      AND column_name = 'branch'
  ) THEN
    EXECUTE 'UPDATE public.team_members SET branches = branch WHERE branches = ''{}''::TEXT[]';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.project_files (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  uploaded_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  filename       TEXT        NOT NULL,
  storage_path   TEXT        NOT NULL,
  size           BIGINT      NOT NULL DEFAULT 0,
  content_type   TEXT        NOT NULL DEFAULT 'application/octet-stream',
  source         TEXT        NOT NULL DEFAULT 'local' CHECK (source IN ('local', 'github')),
  github_branch  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, filename)
);

CREATE INDEX IF NOT EXISTS idx_project_files_project_id
  ON public.project_files (project_id);

CREATE INDEX IF NOT EXISTS idx_project_files_uploaded_by
  ON public.project_files (uploaded_by);

ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'project_files'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_files;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'project_files'
      AND policyname = 'project_files_select_policy'
  ) THEN
    CREATE POLICY project_files_select_policy
      ON public.project_files
      FOR SELECT
      USING (
        (SELECT owner_id FROM public.projects WHERE id = project_id) = auth.uid()
        OR
        (SELECT team_id FROM public.projects WHERE id = project_id) IN (
          SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'project_files'
      AND policyname = 'project_files_insert_policy'
  ) THEN
    CREATE POLICY project_files_insert_policy
      ON public.project_files
      FOR INSERT
      WITH CHECK (
        (SELECT owner_id FROM public.projects WHERE id = project_id) = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.team_members tm
          JOIN public.projects p ON p.team_id = tm.team_id
          WHERE p.id = project_id
            AND tm.user_id = auth.uid()
            AND tm.role IN ('admin', 'developer')
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'project_files'
      AND policyname = 'project_files_delete_policy'
  ) THEN
    CREATE POLICY project_files_delete_policy
      ON public.project_files
      FOR DELETE
      USING ((SELECT owner_id FROM public.projects WHERE id = project_id) = auth.uid());
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-files',
  'project-files',
  false,
  10485760,
  ARRAY[
    'text/plain',
    'text/x-c',
    'text/x-c++',
    'text/x-csrc',
    'text/x-c++src',
    'application/octet-stream',
    'application/zip',
    'application/x-zip-compressed'
  ]
)
ON CONFLICT (id) DO UPDATE
SET file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.scans
  ADD COLUMN IF NOT EXISTS project_name    TEXT,
  ADD COLUMN IF NOT EXISTS scan_type       TEXT DEFAULT 'upload',
  ADD COLUMN IF NOT EXISTS risk_level      TEXT,
  ADD COLUMN IF NOT EXISTS risk_score      INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_vulns     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS files_scanned   INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS file_name       TEXT,
  ADD COLUMN IF NOT EXISTS duration_secs   INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_message   TEXT;

ALTER TABLE public.vulnerabilities
  ADD COLUMN IF NOT EXISTS cwe_id          TEXT,
  ADD COLUMN IF NOT EXISTS cwe_name        TEXT,
  ADD COLUMN IF NOT EXISTS function_name   TEXT,
  ADD COLUMN IF NOT EXISTS file_path       TEXT,
  ADD COLUMN IF NOT EXISTS fix_suggestion  TEXT,
  ADD COLUMN IF NOT EXISTS absolute_line   INTEGER DEFAULT 0;
