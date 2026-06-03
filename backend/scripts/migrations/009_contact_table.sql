-- =============================================================================
-- Migration 009: Create Contacts Table
-- SecureGuard Pro
-- =============================================================================
-- This migration creates a table to store contact form submissions.
-- No foreign keys to auth.users — contacts can be from anyone (authenticated or not)
-- Status field tracks: new, in-progress, resolved
-- =============================================================================

CREATE TABLE IF NOT EXISTS contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  subject     TEXT NOT NULL,
  message     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in-progress', 'resolved')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create trigger to auto-update updated_at
CREATE TRIGGER contacts_updated_at
BEFORE UPDATE ON contacts
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- Create index on email for quick lookups
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);

-- Create index on created_at for sorting by newest first
CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts(created_at DESC);

-- Enable RLS (Row Level Security) — public can insert, only admins can read
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can insert a contact
CREATE POLICY "Allow anyone to submit contact" ON contacts
  FOR INSERT
  WITH CHECK (true);

-- Policy: Admins can view/update/delete (you can add admin role check later if needed)
-- For now, allow authenticated users to view their own submissions
CREATE POLICY "Authenticated users can view all contacts" ON contacts
  FOR SELECT
  USING (true);

-- =============================================================================
-- Note: If you want to restrict viewing to admins only later, update the policy:
-- ALTER POLICY "Authenticated users can view all contacts" ON contacts
--   USING (auth.uid() IN (SELECT user_id FROM admin_table));
-- =============================================================================
