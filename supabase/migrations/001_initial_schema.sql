-- =============================================================================
-- Migration 001: Initial Schema
-- SecureGuard Pro
-- =============================================================================
-- IMPORTANT: Supabase automatically creates auth.users table.
-- We extend it with our own tables using auth.users.id as foreign key.
-- Every table has:
--   id         -> unique identifier (UUID, auto-generated)
--   created_at -> timestamp, auto-set on insert
--   updated_at -> timestamp, auto-updated on every change
-- =============================================================================


-- =============================================================================
-- HELPER: auto-update updated_at on every row change
-- This is a reusable function - DRY principle applied to SQL
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS
$func$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$func$
LANGUAGE plpgsql;


-- =============================================================================
-- TABLE: profiles
-- Extends Supabase auth.users with app-specific user data.
-- Created automatically when a user signs up (via Supabase trigger).
-- =============================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create a profile row when a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS
$func$
BEGIN
  INSERT INTO profiles (id, full_name)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$func$
LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- =============================================================================
-- TABLE: teams
-- =============================================================================
CREATE TABLE IF NOT EXISTS teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  github_repo TEXT,
  created_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =============================================================================
-- TABLE: team_members
-- =============================================================================
CREATE TYPE team_role AS ENUM ('admin', 'developer', 'viewer');

CREATE TABLE IF NOT EXISTS team_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       team_role NOT NULL DEFAULT 'developer',
  branch     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

CREATE TRIGGER team_members_updated_at
  BEFORE UPDATE ON team_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =============================================================================
-- TABLE: projects
-- =============================================================================
CREATE TYPE project_language AS ENUM ('python', 'c', 'cpp');

CREATE TABLE IF NOT EXISTS projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  language    project_language NOT NULL,
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id     UUID REFERENCES teams(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =============================================================================
-- TABLE: scans
-- =============================================================================
CREATE TYPE scan_status AS ENUM ('pending', 'in_progress', 'completed', 'failed');

CREATE TABLE IF NOT EXISTS scans (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status       scan_status NOT NULL DEFAULT 'pending',
  file_path    TEXT,
  branch       TEXT,
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER scans_updated_at
  BEFORE UPDATE ON scans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =============================================================================
-- TABLE: vulnerabilities
-- =============================================================================
CREATE TYPE vuln_severity AS ENUM ('critical', 'high', 'medium', 'low');

CREATE TABLE IF NOT EXISTS vulnerabilities (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id      UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  severity     vuln_severity NOT NULL,
  type         TEXT NOT NULL,
  line_number  INTEGER,
  description  TEXT NOT NULL,
  code_snippet TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- TABLE: reports
-- =============================================================================
CREATE TYPE report_format AS ENUM ('pdf', 'csv');
CREATE TYPE report_status AS ENUM ('pending', 'completed', 'failed');

CREATE TABLE IF NOT EXISTS reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id     UUID REFERENCES scans(id) ON DELETE SET NULL,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  format      report_format NOT NULL DEFAULT 'pdf',
  status      report_status NOT NULL DEFAULT 'pending',
  file_path   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER reports_updated_at
  BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =============================================================================
-- TABLE: alerts
-- =============================================================================
CREATE TYPE alert_status AS ENUM ('open', 'acknowledged', 'resolved');

CREATE TABLE IF NOT EXISTS alerts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vulnerability_id UUID NOT NULL REFERENCES vulnerabilities(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status           alert_status NOT NULL DEFAULT 'open',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER alerts_updated_at
  BEFORE UPDATE ON alerts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================
ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams           ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects        ENABLE ROW LEVEL SECURITY;
ALTER TABLE scans           ENABLE ROW LEVEL SECURITY;
ALTER TABLE vulnerabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports         ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts          ENABLE ROW LEVEL SECURITY;

-- profiles: users can only read/update their own profile
CREATE POLICY "profiles: owner access"
  ON profiles FOR ALL
  USING (auth.uid() = id);

-- teams: members can see teams they belong to
CREATE POLICY "teams: member access"
  ON teams FOR SELECT
  USING (id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- teams: only creator can insert/update/delete
CREATE POLICY "teams: creator modify"
  ON teams FOR ALL
  USING (created_by = auth.uid());

-- team_members: members can see other members of their teams
CREATE POLICY "team_members: team access"
  ON team_members FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- projects: owner access
CREATE POLICY "projects: owner access"
  ON projects FOR ALL
  USING (owner_id = auth.uid());

-- projects: team member read access
CREATE POLICY "projects: team member access"
  ON projects FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- scans: owner access
CREATE POLICY "scans: owner access"
  ON scans FOR ALL
  USING (user_id = auth.uid());

-- vulnerabilities: accessible if user owns the scan
CREATE POLICY "vulnerabilities: scan owner access"
  ON vulnerabilities FOR SELECT
  USING (scan_id IN (SELECT id FROM scans WHERE user_id = auth.uid()));

-- reports: owner access
CREATE POLICY "reports: owner access"
  ON reports FOR ALL
  USING (user_id = auth.uid());

-- alerts: owner access
CREATE POLICY "alerts: owner access"
  ON alerts FOR ALL
  USING (user_id = auth.uid());
