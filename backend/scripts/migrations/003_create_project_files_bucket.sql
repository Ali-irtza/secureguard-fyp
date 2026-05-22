-- Migration: 003_create_project_files_bucket.sql
-- Purpose: Create the Supabase Storage bucket for project source files
--          and configure Row-Level Security so only the project owner
--          can upload, read, and delete their own files.
--
-- Storage path convention:
--   project-files/{project_id}/{filename}
--
-- RLS rules:
--   SELECT (download): owner_id of the project matches auth.uid()
--   INSERT (upload):   owner_id of the project matches auth.uid()
--   DELETE:            owner_id of the project matches auth.uid()
--
-- Note: The backend uses the service_role key which bypasses RLS.
--       These policies protect direct client-side Supabase SDK access.
--       Run this in the Supabase SQL editor or via supabase db push.

-- ============================================================
-- SECTION 1: Create the storage bucket
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-files',
  'project-files',
  false,                          -- private bucket — no public URLs
  10485760,                       -- 10 MB per file
  ARRAY[
    'text/plain',
    'text/x-c',
    'text/x-c++',
    'text/x-csrc',
    'text/x-c++src',
    'application/octet-stream'    -- fallback for editors that send generic type
  ]
)
ON CONFLICT (id) DO NOTHING;     -- idempotent

-- ============================================================
-- SECTION 2: RLS policies for storage.objects
-- ============================================================

-- SELECT: project owner can download their files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'project_files_select_policy'
  ) THEN
    CREATE POLICY project_files_select_policy
      ON storage.objects
      FOR SELECT
      USING (
        bucket_id = 'project-files'
        AND (
          SELECT owner_id FROM public.projects
          WHERE id::text = (string_to_array(name, '/'))[1]
        ) = auth.uid()
      );
  END IF;
END $$;

-- INSERT: project owner can upload files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'project_files_insert_policy'
  ) THEN
    CREATE POLICY project_files_insert_policy
      ON storage.objects
      FOR INSERT
      WITH CHECK (
        bucket_id = 'project-files'
        AND (
          SELECT owner_id FROM public.projects
          WHERE id::text = (string_to_array(name, '/'))[1]
        ) = auth.uid()
      );
  END IF;
END $$;

-- DELETE: project owner can delete their files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'project_files_delete_policy'
  ) THEN
    CREATE POLICY project_files_delete_policy
      ON storage.objects
      FOR DELETE
      USING (
        bucket_id = 'project-files'
        AND (
          SELECT owner_id FROM public.projects
          WHERE id::text = (string_to_array(name, '/'))[1]
        ) = auth.uid()
      );
  END IF;
END $$;
