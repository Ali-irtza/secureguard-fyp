-- Migration: 001_enable_realtime.sql
-- Purpose: Enable Supabase Realtime CDC on scans, alerts, and team_members tables
--          and configure Row-Level Security policies using the ACTUAL schema.
--
-- Real schema relationships:
--   scans.user_id        → auth.users.id  (user owns the scan)
--   scans.project_id     → projects.id    (scan belongs to a project)
--   projects.team_id     → teams.id       (project belongs to a team)
--   alerts.user_id       → auth.users.id  (user owns the alert)
--   team_members.user_id → auth.users.id
--   team_members.team_id → teams.id
--
-- Idempotent: safe to run multiple times.

-- ============================================================
-- SECTION 1: Add tables to the supabase_realtime publication
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'scans'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.scans;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'alerts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'team_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_members;
  END IF;
END $$;

-- ============================================================
-- SECTION 2: Enable Row-Level Security
-- (idempotent — ALTER TABLE ... ENABLE ROW LEVEL SECURITY
--  is a no-op if already enabled)
-- ============================================================

ALTER TABLE public.scans        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SECTION 3: RLS SELECT policies
--
-- scans: no team_id column — scans are owned by user_id directly.
--   A user can read their own scans.
--   Team members can also read scans belonging to projects in their team
--   via: scans.project_id → projects.team_id → team_members.team_id
-- ============================================================

-- scans: user can read their own scans
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'scans'
      AND policyname = 'users_can_read_own_scans'
  ) THEN
    CREATE POLICY users_can_read_own_scans
      ON public.scans
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;

-- scans: team members can read scans for projects in their team
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'scans'
      AND policyname = 'team_members_can_read_team_scans'
  ) THEN
    CREATE POLICY team_members_can_read_team_scans
      ON public.scans
      FOR SELECT
      USING (
        project_id IN (
          SELECT p.id
          FROM   public.projects p
          JOIN   public.team_members tm ON tm.team_id = p.team_id
          WHERE  tm.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- alerts: user can read their own alerts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'alerts'
      AND policyname = 'users_can_read_own_alerts'
  ) THEN
    CREATE POLICY users_can_read_own_alerts
      ON public.alerts
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;

-- team_members: members can read their own team's membership rows
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'team_members'
      AND policyname = 'team_members_can_read_own_team'
  ) THEN
    CREATE POLICY team_members_can_read_own_team
      ON public.team_members
      FOR SELECT
      USING (
        team_id IN (
          SELECT team_id
          FROM   public.team_members
          WHERE  user_id = auth.uid()
        )
      );
  END IF;
END $$;
