-- Store compressed scan report artifacts and keep history statuses simple.

ALTER TABLE public.scans
  ADD COLUMN IF NOT EXISTS report_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS report_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS corrected_code TEXT,
  ADD COLUMN IF NOT EXISTS chunk_outputs JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

ALTER TABLE public.vulnerabilities
  ADD COLUMN IF NOT EXISTS location TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'scan-reports',
  'scan-reports',
  false,
  5242880,
  ARRAY['application/zip', 'application/x-zip-compressed']
)
ON CONFLICT (id) DO UPDATE
SET file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'scan_reports_owner_read'
  ) THEN
    CREATE POLICY scan_reports_owner_read
      ON storage.objects
      FOR SELECT
      USING (
        bucket_id = 'scan-reports'
        AND split_part(name, '/', 1) = auth.uid()::text
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'scan_reports_owner_insert'
  ) THEN
    CREATE POLICY scan_reports_owner_insert
      ON storage.objects
      FOR INSERT
      WITH CHECK (
        bucket_id = 'scan-reports'
        AND split_part(name, '/', 1) = auth.uid()::text
      );
  END IF;
END $$;

UPDATE public.scans
SET status = 'failed'
WHERE status IN ('pending', 'in_progress');
