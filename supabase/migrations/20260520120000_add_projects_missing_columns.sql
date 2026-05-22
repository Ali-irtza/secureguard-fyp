-- Migration: 20260520120000_add_projects_missing_columns.sql
-- Purpose: Add missing columns to the existing public.projects table.
--
-- The projects table was created previously with a different schema.
-- This migration adds the columns required by the new backend service:
--   - health_score: letter grade A-F for security health
--   - type: 'personal' or 'team' project ownership scope
--
-- Also fixes the owner_id FK (was missing), adds indexes, trigger, RLS,
-- and Realtime publication enrollment — all idempotent.
--
-- Idempotent: safe to run multiple times.

-- ============================================================
-- SECTION 1: Add missing columns (idempotent)
-- ============================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS health_score TEXT
    CHECK (health_score IN ('A', 'B', 'C', 'D', 'F'));

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'personal'
    CHECK (type IN ('personal', 'team'));

-- Ensure owner_id exists and is NOT NULL (it may already exist)
-- We use a DO block because ADD COLUMN IF NOT EXISTS can't set NOT NULL on existing rows
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'projects'
      AND column_name  = 'owner_id'
  ) THEN
    ALTER TABLE public.projects
      ADD COLUMN owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================
-- SECTION 2: Indexes (idempotent)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON public.projects (owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_team_id  ON public.projects (team_id);

-- ============================================================
-- SECTION 3: updated_at trigger (idempotent)
-- ============================================================

DO $$
BEGIN
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

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname   = 'set_projects_updated_at'
      AND tgrelid  = 'public.projects'::regclass
  ) THEN
    CREATE TRIGGER set_projects_updated_at
      BEFORE UPDATE ON public.projects
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ============================================================
-- SECTION 4: Realtime publication enrollment (idempotent)
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
-- SECTION 5: Enable Row-Level Security (idempotent no-op if already on)
-- ============================================================

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SECTION 6: RLS policies (idempotent)
-- ============================================================

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
      AND tablename  = 'projects'
      AND policyname = 'projects_insert_policy'
  ) THEN
    CREATE POLICY projects_insert_policy
      ON public.projects
      FOR INSERT
      WITH CHECK (owner_id = auth.uid());
  END IF;
END $$;

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
