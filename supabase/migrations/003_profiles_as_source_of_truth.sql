-- =============================================================================
-- Migration 003: Profiles table as source of truth
-- =============================================================================
-- PROBLEM:
--   Supabase overwrites user_metadata on every OAuth login with fresh data
--   from Google/GitHub. Any changes the user made (name, avatar) get wiped.
--
-- SOLUTION:
--   The profiles table is the single source of truth for user-editable data.
--   The trigger that creates a profile on first signup uses:
--     ON CONFLICT (id) DO NOTHING
--   This means: first login seeds the profile, every re-login is ignored.
--   The user's edits in profiles table are NEVER overwritten by OAuth.
--
-- NEW COLUMNS:
--   bio      — short user bio (for future profile page)
--   provider — which auth provider they used (google, github, email)
--              stored once at signup, never changes
-- =============================================================================


-- Add new columns to profiles table
-- IF NOT EXISTS guards against re-running this migration accidentally
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS bio      TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT;


-- =============================================================================
-- Updated handle_new_user trigger
-- =============================================================================
-- ON CONFLICT (id) DO NOTHING is the key line.
-- It means:
--   - First login (new user)  → INSERT runs, profile row is created
--   - Re-login (existing user) → INSERT is skipped, nothing is overwritten
--
-- This is the industry-standard pattern for "seed on first login, never touch again"
-- =============================================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS
$func$
BEGIN
  INSERT INTO profiles (id, full_name, avatar_url, provider)
  VALUES (
    NEW.id,
    -- Use the best available name from the OAuth provider
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    -- Use the provider's avatar as the initial picture
    COALESCE(
      NEW.raw_user_meta_data->>'avatar_url',
      NEW.raw_user_meta_data->>'picture'
    ),
    -- Store which provider they used (google, github, email, etc.)
    COALESCE(
      NEW.raw_app_meta_data->>'provider',
      'email'
    )
  )
  -- KEY LINE: if a profile row already exists for this user, do nothing.
  -- This protects all user edits from being overwritten on re-login.
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Never block user creation even if profile insert fails
    RETURN NEW;
END;
$func$
LANGUAGE plpgsql SECURITY DEFINER;
