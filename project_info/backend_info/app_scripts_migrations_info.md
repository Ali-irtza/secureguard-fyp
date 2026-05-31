# backend/scripts/migrations Database Schema Documentation

## Overview
This directory contains SQL migration files that define and evolve the SecureGuard Pro database schema. Migrations are run sequentially in order of their numeric prefix (001, 002, 003, 004, 008...) to establish tables, indexes, Realtime subscriptions, Row-Level Security (RLS) policies, and storage buckets. All migrations are idempotent — they can be safely run multiple times without causing errors.

**Total Migrations**: 5 files  
**Database**: PostgreSQL with Supabase backend  

---

## Migration Execution Order

| Order | File | Purpose |
|-------|------|---------|
| 1 | 001_enable_realtime.sql | Enable Realtime CDC and RLS for core tables |
| 2 | 002_create_projects_table.sql | Create projects table with RLS |
| 3 | 003_create_project_files_bucket.sql | Create Storage bucket for source files |
| 4 | 004_create_project_files_table.sql | Create project_files metadata table |
| 5 | 008_extend_scans_and_vulnerabilities.sql | Add AI scanner columns |

---

## Migration: 001_enable_realtime.sql

### Purpose
Enables Supabase Realtime (Change Data Capture) on the `scans`, `alerts`, and `team_members` tables so frontend clients can receive real-time updates via WebSocket. Also configures Row-Level Security (RLS) SELECT policies with idempotent creation.

### Schema Relationships Documented
```
scans.user_id          → auth.users.id           (user owns the scan)
scans.project_id       → projects.id             (scan belongs to project)
projects.team_id       → teams.id                (project belongs to team)
alerts.user_id         → auth.users.id           (user owns the alert)
team_members.user_id   → auth.users.id
team_members.team_id   → teams.id
```

### Sections Implemented

#### SECTION 1: Add Tables to supabase_realtime Publication
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.scans;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_members;
```

**Effect**:
- Enables Change Data Capture (CDC) on these tables
- When rows are inserted, updated, or deleted, Supabase broadcasts changes via Realtime API
- Frontend can subscribe to these channels and receive live updates
- Idempotent: Uses `pg_publication_tables` check to avoid adding table twice

---

#### SECTION 2: Enable Row-Level Security
```sql
ALTER TABLE public.scans        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
```

**Effect**:
- Activates RLS enforcement on these tables
- After this, no data is visible to users unless an RLS policy explicitly allows it
- Idempotent: Running again is a no-op if RLS already enabled

---

#### SECTION 3: RLS SELECT Policies

**Policy 1: users_can_read_own_scans**
```sql
CREATE POLICY users_can_read_own_scans ON public.scans
  FOR SELECT USING (user_id = auth.uid());
```
- User can read scans they directly own (scans.user_id = current user ID)

**Policy 2: team_members_can_read_team_scans**
```sql
CREATE POLICY team_members_can_read_team_scans ON public.scans
  FOR SELECT
  USING (
    project_id IN (
      SELECT p.id FROM public.projects p
      JOIN public.team_members tm ON tm.team_id = p.team_id
      WHERE tm.user_id = auth.uid()
    )
  );
```
- User can read scans for projects belonging to their teams
- Join chain: scans → projects → team_members (checks user membership)

**Policy 3: users_can_read_own_alerts**
```sql
CREATE POLICY users_can_read_own_alerts ON public.alerts
  FOR SELECT USING (user_id = auth.uid());
```
- User can read alerts they own

**Policy 4: team_members_can_read_own_team**
```sql
CREATE POLICY team_members_can_read_own_team ON public.team_members
  FOR SELECT
  USING (
    team_id IN (
      SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );
```
- User can read their own team memberships

### Key Features
- ✅ Idempotent: Checks with `IF NOT EXISTS` before creating policies
- ✅ Multi-level access: Direct ownership + team membership both supported
- ✅ Realtime-enabled: Frontend can subscribe to live table changes
- ✅ RLS-enforced: PostgreSQL kernel blocks unauthorized access

---

## Migration: 002_create_projects_table.sql

### Purpose
Creates the `public.projects` table as the source of truth for C/C++ code projects. Establishes relationships to users (owner_id) and teams (team_id), enables Realtime, configures updated_at triggers, and sets up RLS policies for personal and team projects.

### Schema

```sql
CREATE TABLE public.projects (
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
```

### Column Definitions

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Auto-generated primary key |
| name | TEXT | Max 255 chars; project display name |
| language | C \| C++ | Programming language of codebase |
| health_score | A-F | Security health grade (A=excellent, F=critical) |
| type | personal \| team | Whether owned by user or a team |
| owner_id | UUID FK | User who created the project; CASCADE delete |
| team_id | UUID FK nullable | Team project belongs to; SET NULL if team deleted |
| created_at | TIMESTAMPTZ | ISO 8601 timestamp; auto-populated |
| updated_at | TIMESTAMPTZ | ISO 8601 timestamp; auto-updated on modifications |

### Indexes

```sql
CREATE INDEX idx_projects_owner_id ON public.projects (owner_id);
CREATE INDEX idx_projects_team_id  ON public.projects (team_id);
```

**Effect**: Fast lookups by owner or team for dashboard queries.

---

### updated_at Auto-Update Trigger

Creates function `set_updated_at()` and attaches trigger `set_projects_updated_at`:

```sql
CREATE FUNCTION public.set_updated_at() RETURNS TRIGGER AS
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;

CREATE TRIGGER set_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
```

**Effect**: Whenever a project row is updated, PostgreSQL automatically sets updated_at to current time.

---

### Realtime Publication

Registers projects table with Supabase Realtime:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
```

**Effect**: Frontend can subscribe to project changes (INSERT, UPDATE, DELETE).

---

### Row-Level Security (RLS) Policies

**Policy 1: projects_select_policy (SELECT)**
```sql
CREATE POLICY projects_select_policy ON public.projects
  FOR SELECT
  USING (
    owner_id = auth.uid()
    OR team_id IN (
      SELECT team_id FROM public.team_members
      WHERE user_id = auth.uid()
    )
  );
```
- User can read projects they own OR projects belonging to their teams

**Policy 2: projects_insert_policy (INSERT)**
```sql
CREATE POLICY projects_insert_policy ON public.projects
  FOR INSERT
  WITH CHECK (owner_id = auth.uid());
```
- User can only create projects where they are the owner

**Policy 3: projects_update_policy (UPDATE)**
```sql
CREATE POLICY projects_update_policy ON public.projects
  FOR UPDATE
  USING (owner_id = auth.uid());
```
- User can only update projects they own

**Policy 4: projects_delete_policy (DELETE)**
```sql
CREATE POLICY projects_delete_policy ON public.projects
  FOR DELETE
  USING (owner_id = auth.uid());
```
- User can only delete projects they own
- Cascade: Deletes also remove related scans, project_files, etc. (via CASCADE constraints)

---

## Migration: 003_create_project_files_bucket.sql

### Purpose
Creates the Supabase Storage bucket named `project-files` for storing source code files (.c, .cpp, etc.) that users upload for scanning. Configures Storage RLS policies so only the project owner can upload, download, and delete their files.

### Storage Bucket Configuration

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-files',
  'project-files',
  false,                          -- Private bucket; no public URLs
  10485760,                       -- 10 MB per file
  ARRAY[
    'text/plain',
    'text/x-c',
    'text/x-c++',
    'text/x-csrc',
    'text/x-c++src',
    'application/octet-stream'
  ]
);
```

**Constraints**:
- **Private**: Files are not publicly accessible; requires authentication
- **10 MB max per file**: Prevents huge uploads that would stress the backend
- **MIME types**: Only C/C++ source files accepted (plus fallback octet-stream for editors)

---

### Storage Path Convention

```
project-files/{project_id}/{filename}
```

Example: `project-files/550e8400-e29b-41d4-a716-446655440000/main.c`

---

### RLS Policies for Storage Objects

**Policy 1: project_files_select_policy (SELECT/Download)**
```sql
CREATE POLICY project_files_select_policy ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'project-files'
    AND (
      SELECT owner_id FROM public.projects
      WHERE id::text = (string_to_array(name, '/'))[1]
    ) = auth.uid()
  );
```

**Logic**:
- Extract project_id from storage path: `string_to_array(name, '/')[1]`
- Look up project owner from `public.projects`
- Allow download only if current user owns the project

---

**Policy 2: project_files_insert_policy (INSERT/Upload)**
```sql
CREATE POLICY project_files_insert_policy ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'project-files'
    AND (
      SELECT owner_id FROM public.projects
      WHERE id::text = (string_to_array(name, '/'))[1]
    ) = auth.uid()
  );
```

**Logic**: Same as SELECT — only project owner can upload files.

---

**Policy 3: project_files_delete_policy (DELETE)**
```sql
CREATE POLICY project_files_delete_policy ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'project-files'
    AND (
      SELECT owner_id FROM public.projects
      WHERE id::text = (string_to_array(name, '/'))[1]
    ) = auth.uid()
  );
```

**Logic**: Only project owner can delete files.

---

### Security Notes

- ✅ Backend uses `service_role` key (bypasses RLS) for administrative operations
- ✅ These policies protect direct Supabase SDK access from frontend
- ✅ Non-owner users cannot bypass RLS to access other users' files
- ⚠️ Storage objects are NOT removed when `public.projects` is deleted (data isolation layer)
- ⚠️ Manual cleanup of orphaned buckets may be needed if projects are frequently deleted

---

## Migration: 004_create_project_files_table.sql

### Purpose
Creates the `public.project_files` table as a SQL-queryable metadata index on top of the storage bucket. Previously, file metadata lived only as custom headers on storage objects (not queryable, not realtime, no audit trail). This table is the source of truth for file listing, realtime sync, and future scan references.

### Schema

```sql
CREATE TABLE public.project_files (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  uploaded_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  filename       TEXT        NOT NULL,
  storage_path   TEXT        NOT NULL,
  size           BIGINT      NOT NULL DEFAULT 0,
  content_type   TEXT        NOT NULL DEFAULT 'application/octet-stream',
  source         TEXT        NOT NULL DEFAULT 'local' CHECK (source IN ('local', 'github')),
  github_branch  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE (project_id, filename)
);
```

### Column Definitions

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Auto-generated primary key |
| project_id | UUID FK | Which project owns this file; CASCADE delete |
| uploaded_by | UUID FK nullable | User who uploaded; SET NULL if user deleted |
| filename | TEXT | e.g., "main.c", "utils.cpp" |
| storage_path | TEXT | Full path in bucket: "{project_id}/{filename}" |
| size | BIGINT | File size in bytes |
| content_type | TEXT | MIME type (e.g., "text/x-c", "text/x-c++") |
| source | local \| github | Whether uploaded locally or imported from GitHub branch |
| github_branch | TEXT nullable | Branch name if source='github'; NULL for local uploads |
| created_at | TIMESTAMPTZ | When file was added to metadata table |

---

### Constraints

```sql
UNIQUE (project_id, filename)
```

**Effect**: No duplicate filenames per project; allows upsert semantics. If user re-uploads a file with the same name, the backend can replace the row (or update it).

---

### Indexes

```sql
CREATE INDEX idx_project_files_project_id ON public.project_files (project_id);
CREATE INDEX idx_project_files_uploaded_by ON public.project_files (uploaded_by);
```

**Effect**: Fast queries like "find all files for this project" or "find all files uploaded by this user".

---

### Realtime Publication

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_files;
```

**Effect**: Frontend can subscribe to file uploads/deletions in real-time (e.g., file list updates automatically).

---

### Row-Level Security (RLS) Policies

**Policy 1: project_files_select_policy (SELECT)**
```sql
CREATE POLICY project_files_select_policy ON public.project_files
  FOR SELECT
  USING (
    (SELECT owner_id FROM public.projects WHERE id = project_id) = auth.uid()
    OR
    (SELECT team_id FROM public.projects WHERE id = project_id) IN (
      SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );
```

**Logic**:
- User can see files if they own the project
- OR user is a member of the team that owns the project

---

**Policy 2: project_files_insert_policy (INSERT)**
```sql
CREATE POLICY project_files_insert_policy ON public.project_files
  FOR INSERT
  WITH CHECK (
    (SELECT owner_id FROM public.projects WHERE id = project_id) = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.projects p ON p.team_id = tm.team_id
      WHERE p.id = project_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('admin', 'developer')
    )
  );
```

**Logic**:
- Project owner can upload files
- OR team admin/developer (not viewers) can upload to team projects

---

**Policy 3: project_files_delete_policy (DELETE)**
```sql
CREATE POLICY project_files_delete_policy ON public.project_files
  FOR DELETE
  USING (
    (SELECT owner_id FROM public.projects WHERE id = project_id) = auth.uid()
  );
```

**Logic**: Only project owner can delete files (stricter than INSERT; viewers and developers cannot delete).

---

### Key Design Notes

- **Dual Storage**: Files live in two places:
  1. Storage bucket (actual bytes: `storage.objects`)
  2. Metadata table (queryable: `public.project_files`)
- **Sync Responsibility**: Backend must keep both in sync on upload/delete
- **Queryability**: This table enables SQL queries like "find all .c files in project X" (can't do that on storage objects alone)
- **Realtime**: Frontend can subscribe to file additions/deletions
- **No Automatic Cleanup**: If storage objects are deleted but metadata isn't, orphaned rows remain (low-priority cleanup task)

---

## Migration: 008_extend_scans_and_vulnerabilities.sql

### Purpose
Adds new columns to existing `scans` and `vulnerabilities` tables to support AI scanner results, execution metadata, and risk scoring. This migration extends existing tables rather than creating new ones.

### Scans Table Extensions

```sql
ALTER TABLE scans ADD COLUMN IF NOT EXISTS
  project_name    TEXT,
  scan_type       TEXT DEFAULT 'upload' CHECK (scan_type IN ('upload', 'github')),
  risk_level      TEXT,
  risk_score      INTEGER DEFAULT 0,
  total_vulns     INTEGER DEFAULT 0,
  files_scanned   INTEGER DEFAULT 0,
  file_name       TEXT,
  duration_secs   INTEGER DEFAULT 0,
  error_message   TEXT;
```

#### New Columns

| Column | Type | Purpose |
|--------|------|---------|
| project_name | TEXT | Human-readable name of scanned project |
| scan_type | upload \| github | Source: file upload or GitHub branch import |
| risk_level | TEXT | Aggregate risk ("critical", "high", "medium", "low") |
| risk_score | INTEGER | Numeric risk score (0-100 or similar) |
| total_vulns | INTEGER | Count of vulnerabilities found |
| files_scanned | INTEGER | How many files were analyzed |
| file_name | TEXT | For single-file scans, which file was scanned |
| duration_secs | INTEGER | How long the scan took (seconds) |
| error_message | TEXT | If scan failed, error message for debugging |

---

### Vulnerabilities Table Extensions

```sql
ALTER TABLE vulnerabilities ADD COLUMN IF NOT EXISTS
  cwe_id          TEXT,
  cwe_name        TEXT,
  function_name   TEXT,
  file_path       TEXT,
  fix_suggestion  TEXT,
  absolute_line   INTEGER DEFAULT 0;
```

#### New Columns

| Column | Type | Purpose |
|--------|------|---------|
| cwe_id | TEXT | CWE reference (e.g., "CWE-120" for buffer overflow) |
| cwe_name | TEXT | CWE description (e.g., "Buffer Overflow") |
| function_name | TEXT | Which C/C++ function contains the vulnerability |
| file_path | TEXT | File path where vulnerability was found (e.g., "src/main.c") |
| fix_suggestion | TEXT | LLM-generated remediation advice |
| absolute_line | INTEGER | Line number in the source file |

---

### Why This Migration Exists

This migration extends existing tables rather than creating new ones because:
1. **Backward Compatibility**: Doesn't break existing scans/vulnerabilities data
2. **Additive**: Only adds columns; existing queries still work
3. **Optional Data**: Columns are added with defaults or nullable (not required)
4. **Idempotent**: Uses `IF NOT EXISTS` so running twice is safe

---

### Data Flow Example

**Before a Scan**:
```
Frontend → Backend (FastAPI)
  → Backend calls FreeLLMAPI
  → AI analyzes code snippets
```

**After a Scan (Results Inserted)**:
```
scans row created with:
  - project_name: "SecurityScanner"
  - scan_type: "github"
  - total_vulns: 3
  - files_scanned: 5
  - duration_secs: 12
  - risk_score: 75

vulnerabilities rows created for each finding:
  - cwe_id: "CWE-120"
  - cwe_name: "Buffer Overflow"
  - function_name: "parse_config()"
  - file_path: "src/config.c"
  - absolute_line: 45
  - fix_suggestion: "Use snprintf() instead of sprintf()..."
```

---

## Design Patterns & Principles

### Idempotency
All migrations use `CREATE TABLE IF NOT EXISTS`, `CREATE POLICY IF NOT EXISTS`, and `IF NOT EXISTS` checks in PL/pgSQL blocks. This means:
- Migrations can be re-run without causing errors
- Safe for CI/CD pipelines to replay migrations
- Safe for manual reruns during debugging

### RLS Security Model
```
Frontend SDK              Backend (service_role)
  ↓                            ↓
  Governed by RLS policies     Bypasses RLS
  (reads user's own data)      (full access for admin)
```

### Cascade & Referential Integrity
- **CASCADE**: Delete project → automatically delete scans, project_files, etc.
- **SET NULL**: Delete user → set project.owner_id to NULL (preserves audit trail)

### Realtime-First Design
- Every table that needs live updates (`scans`, `projects`, `project_files`, etc.) is registered with Realtime publication
- Frontend can instantly see changes without polling

### Storage + SQL Index Pattern
- **Storage bucket**: Actual bytes (files)
- **SQL table**: Metadata (for querying, filtering, realtime)
- **Sync responsibility**: Backend keeps both in sync

---

## Migration Best Practices

### Running Migrations

**In Supabase Dashboard**:
1. Navigate to SQL Editor
2. Paste migration content
3. Run each migration in sequence

**Via Supabase CLI** (if configured):
```bash
supabase db push
```

**In Python/FastAPI**:
```python
# Backend doesn't auto-run migrations
# Developer must manually execute migration files in Supabase dashboard
```

### Testing Migrations
1. Test on staging database first
2. Verify RLS policies work: Create test user, verify they see only their data
3. Verify Realtime: Subscribe to table changes, insert a row, verify notification
4. Verify Referential Integrity: Delete parent row, verify child rows cascade correctly

### Rollback Strategy
- ⚠️ No automatic rollback: Migrations are forward-only
- To undo, create a new migration that reverts changes (DROP POLICY, DROP TABLE, etc.)
- Keep old migrations; don't delete from git history

---

## Summary Table

| Migration | Tables Created/Modified | Key Features |
|-----------|-------------------------|--------------|
| 001 | scans, alerts, team_members | Enable Realtime, RLS SELECT policies |
| 002 | projects | Full CRUD RLS, updated_at trigger, Realtime |
| 003 | storage bucket | Storage RLS for 10MB files |
| 004 | project_files | Metadata index on storage, Realtime, team RLS |
| 008 | scans, vulnerabilities | AI scanner result columns |

**Total Tables Managed**: 5+ across database + storage  
**Total RLS Policies**: 20+  
**Total Realtime Tables**: 4+  

---

## Troubleshooting

### "RLS Policy Already Exists" Error
- Migration uses `IF NOT EXISTS` checks
- If you manually created a policy with same name, the check prevents creation
- Delete the manual policy and re-run migration

### "Can't Upload Files"
- Check storage bucket exists: `INSERT INTO storage.buckets ...`
- Check Storage RLS policies are created
- Verify project owner matches current user
- Check file size < 10 MB

### "Realtime Not Updating"
- Verify table is in `supabase_realtime` publication
- Verify RLS policies allow user to see rows
- Check frontend subscription is active
- Restart Realtime service (rare)

### "CASCADE Delete Failing"
- Check referential integrity constraints exist
- Ensure parent table has `ON DELETE CASCADE` defined
- Verify no orphaned foreign keys

---

## Future Migrations

**Potential next migrations**:
- 009_create_reports_table.sql — Performance analytics
- 010_create_alerts_table.sql — Vulnerability notifications
- 011_add_audit_log_table.sql — Security event tracking
- 012_create_team_invites_table.sql — Pending team membership

All would follow the same pattern: CREATE TABLE IF NOT EXISTS, RLS policies, Realtime publication.
