-- =============================================================================
-- Migration 002: Fix handle_new_user trigger
-- =============================================================================
-- The original trigger fails when full_name is null (OAuth users don't always
-- provide it). We add error handling so the trigger never blocks user creation.
-- Also fix the teams.created_by column constraint contradiction.
-- =============================================================================

-- Drop and recreate the trigger function with proper error handling
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS
$func$
BEGIN
  INSERT INTO profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Never block user creation even if profile insert fails
    RETURN NEW;
END;
$func$
LANGUAGE plpgsql SECURITY DEFINER;

-- Fix teams.created_by: NOT NULL + ON DELETE SET NULL is a contradiction
-- Change to ON DELETE CASCADE so deleting a user deletes their teams
ALTER TABLE teams
  DROP CONSTRAINT teams_created_by_fkey,
  ADD CONSTRAINT teams_created_by_fkey
    FOREIGN KEY (created_by)
    REFERENCES auth.users(id)
    ON DELETE CASCADE;
