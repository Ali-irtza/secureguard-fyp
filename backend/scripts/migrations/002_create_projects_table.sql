-- Migration: 002_create_projects_table.sql
-- Purpose: Create the public.projects table with all columns, constraints,
--          indexes, updated_at trigger, Realtime publication enrollment,
--          and Row-Level Security policies.
--
-- Schema relationships:
--   projects.owner_id  → auth.users.id   (user who created the project, CASCADE)
--   projects.team_id   → public.teams.id (team the project belongs to, SET NULL)
--   scans.project_id   → projects.id     (scans reference this table)
--
-- RLS visibility rules:
--   SELECT: owner_id = auth.uid() OR team_id IN user's team memberships
--   INSERT: owner_id must equal auth.uid()
--   UPDATE: owner_id must equal auth.uid()
--   DELETE: owner_id must equal auth.uid()
--
-- Idempotent: safe to run multiple times.

-- ============================================================
-- SECTION 1: Create the projects table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.projects (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL CHECK (char_length(name) <= 255),
  language     TEXT        CHECK (language IN ('C', 'C++')),
  health_score TEXT        CHECK (health_score IN ('A', 'B', 'C', 'D', 'F')),
  type         TEXT        NOT NULL DEFAULT 'personal' CHECK (type IN ('personal', 'team')),
  owner_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id      UUID        REFERENCES public.teams(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SECTION 2: Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON public.projects (owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_team_id  ON public.projects (team_id);

-- ============================================================
-- SECTION 3: updated_at auto-update trigger
-- ============================================================

DO $$
BEGIN
  -- Create the trigger function if it does not already exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'set_updated_at'
      AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    CREATE FUNCTION public.set_updated_at()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $func$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $func$;
  END IF;

  -- Attach the trigger to public.projects if it does not already exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_projects_updated_at'
      AND tgrelid = 'public.projects'::regclass
  ) THEN
    CREATE TRIGGER set_projects_updated_at
      BEFORE UPDATE ON public.projects
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ============================================================
-- SECTION 4: Add projects to the supabase_realtime publication
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname    = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'projects'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
  END IF;
END $$;

-- ============================================================
-- SECTION 5: Enable Row-Level Security
-- (idempotent — ALTER TABLE ... ENABLE ROW LEVEL SECURITY
--  is a no-op if already enabled)
-- ============================================================

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SECTION 6: RLS policies
-- ============================================================

-- SELECT: user can read their own projects and projects belonging to their teams
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'projects'
      AND policyname = 'projects_select_policy'
  ) THEN
    CREATE POLICY projects_select_policy
      ON public.projects
      FOR SELECT
      USING (
        owner_id = auth.uid()
        OR team_id IN (
          SELECT team_id
          FROM   public.team_members
          WHERE  user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- INSERT: user can only insert rows where they are the owner
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'projects'
      AND policyname = 'projects_insert_policy'
  ) THEN
    CREATE POLICY projects_insert_policy
      ON public.projects
      FOR INSERT
      WITH CHECK (owner_id = auth.uid());
  END IF;
END $$;

-- UPDATE: user can only update rows they own
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'projects'
      AND policyname = 'projects_update_policy'
  ) THEN
    CREATE POLICY projects_update_policy
      ON public.projects
      FOR UPDATE
      USING (owner_id = auth.uid());
  END IF;
END $$;

-- DELETE: user can only delete rows they own
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'projects'
      AND policyname = 'projects_delete_policy'
  ) THEN
    CREATE POLICY projects_delete_policy
      ON public.projects
      FOR DELETE
      USING (owner_id = auth.uid());
  END IF;
END $$;
