-- ============================================================
-- Migration 008: Extend scans and vulnerabilities tables
-- for AI scanner results
-- ============================================================

-- Add missing columns to scans table
ALTER TABLE scans
  ADD COLUMN IF NOT EXISTS project_name    TEXT,
  ADD COLUMN IF NOT EXISTS scan_type       TEXT DEFAULT 'upload'
                                           CHECK (scan_type IN ('upload', 'github')),
  ADD COLUMN IF NOT EXISTS risk_level      TEXT,
  ADD COLUMN IF NOT EXISTS risk_score      INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_vulns     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS files_scanned   INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS file_name       TEXT,
  ADD COLUMN IF NOT EXISTS duration_secs   INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_message   TEXT;

-- Add missing columns to vulnerabilities table
ALTER TABLE vulnerabilities
  ADD COLUMN IF NOT EXISTS cwe_id          TEXT,
  ADD COLUMN IF NOT EXISTS cwe_name        TEXT,
  ADD COLUMN IF NOT EXISTS function_name   TEXT,
  ADD COLUMN IF NOT EXISTS file_path       TEXT,
  ADD COLUMN IF NOT EXISTS fix_suggestion  TEXT,
  ADD COLUMN IF NOT EXISTS absolute_line   INTEGER DEFAULT 0;
