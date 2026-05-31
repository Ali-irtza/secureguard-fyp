# SecureGuard Pro Backend — Complete Documentation Guide

Welcome! This folder contains comprehensive, detailed documentation of the entire SecureGuard Pro backend. If you're new to the codebase or an LLM analyzing the architecture, **start here and follow the reading flow below**.

---

## Quick Overview

**What is SecureGuard Pro?**  
An AI-powered security code scanner that detects vulnerabilities in C/C++ code using:
- AI/LLM-based vulnerability detection (with custom CWE definitions)
- GitHub repository integration (branch browsing, file fetching, OAuth)
- Team-based collaboration (role-based access control)
- Secure file storage (Supabase + object storage)

**Tech Stack**: FastAPI (Python 3.11) | Supabase (PostgreSQL) | GitHub OAuth | Docker

---

## 📚 Documentation Reading Flow

Follow this order to build a complete mental model of the backend:

### **Phase 1: Foundation & Infrastructure (Start Here)**
These files explain how the backend is configured, deployed, and initialized.

#### **1. `backend_env_dockerfile_requirements_dockerignore_info.md`** (23 KB)
**Why First**: Understand how the backend runs and what dependencies it needs.

**Covers**:
- **.dockerignore**: What files Docker excludes during build (saves 57% image size)
- **.env.example**: All 9 configuration variables (Supabase, GitHub OAuth, CORS)
- **Dockerfile**: Multi-stage build strategy (builder + runtime stages)
- **requirements.txt**: All 8 Python packages with versions and purposes

**Key Takeaway**: 
- Backend runs on Python 3.11 with FastAPI + Uvicorn
- Supabase handles database + auth + storage
- Secrets (API keys) injected at runtime, never in Docker image
- Docker image is ~250 MB (optimized multi-stage build)

**Next**: Once you understand the infrastructure, move to app initialization.

---

#### **2. `app_config_main_dependencies_info.md`** (19 KB)
**Why Second**: Understand app initialization, configuration loading, and dependency injection.

**Covers**:
- **config.py**: Pydantic Settings loads environment variables, validates them
- **dependencies.py**: Shared dependency injection (JWT auth, Supabase client singleton)
- **main.py**: FastAPI app creation, CORS setup, router registration, middleware

**Key Functions**:
- `Settings()` class: Environment variable validation
- `get_current_user()`: JWT authentication dependency (every protected endpoint uses this)
- `get_supabase_client()`: Singleton Supabase client (connection pooling)
- App initialization: Router registration, health check endpoint

**Key Takeaway**:
- All HTTP dependencies are injected (Supabase client, current user)
- JWT validation happens in middleware (protects all routes)
- Supabase client is singleton (reused across all requests)

**Next**: Now understand the data models used throughout the app.

---

### **Phase 2: Data Models & API Structure (Core Understanding)**
These files explain what data the backend stores and what requests/responses look like.

#### **3. `app_models_dir_info.md`** (19 KB)
**Why Third**: Understand all Pydantic schemas for request/response validation.

**Covers 5 Model Files**:
1. **auth.py**: User profile requests/responses
2. **teams.py**: Team CRUD, member invitations, GitHub repository connections
3. **projects.py**: Project CRUD, bulk operations, project settings
4. **project_files.py**: File upload/import, file metadata
5. **scans.py**: Scan requests, vulnerability results, CWE mappings

**Key Schemas**:
- Request models: What the frontend sends to the API
- Response models: What the API returns to the frontend
- Database models: What's stored in Supabase
- Field validation: Constraints, defaults, optional vs required

**Key Takeaway**:
- 30+ Pydantic schemas define the entire data structure
- All inputs validated (no garbage data enters the system)
- Schemas show relationships (e.g., Project contains multiple Files)

**Next**: Now understand the HTTP endpoints that use these models.

---

#### **4. `app_routers_dir_info.md`** (28 KB)
**Why Fourth**: Understand all HTTP endpoints, methods, and access control.

**Covers 5 Router Files**:
1. **auth.py**: Authentication endpoints (GET /auth/me, POST /auth/profile)
2. **teams.py**: Team management + GitHub integration (25+ endpoints)
3. **projects.py**: Project CRUD (6 endpoints)
4. **project_files.py**: File upload/import/delete (5 endpoints)
5. **scans.py**: Scan trigger and results (2 endpoints)

**Key Endpoints**:
- `/auth/me`: Get current user profile
- `/teams`: List, create, update, delete teams
- `/teams/{id}/github/authorize`: GitHub App OAuth flow
- `/projects`: Full CRUD
- `/projects/{id}/files`: Upload files
- `/teams/{id}/scans`: Trigger vulnerability scan

**Key Takeaway**:
- 25+ total endpoints across 5 routers
- Each endpoint protected by JWT (requires authenticated user)
- Access control varies (owner-only, team-level, branch-level)
- Error responses documented (403 forbidden, 404 not found, etc.)

**Next**: Now understand the business logic behind these endpoints.

---

### **Phase 3: Business Logic & Services (Deep Dive)**
These files explain HOW each feature works (not just what endpoints exist).

#### **5. `app_services_auth.md`** (9 KB)
**Purpose**: User profile management

**Covers**:
- User profile creation/update in Supabase
- Field validation and constraints
- Database queries and error handling

**Key Takeaway**:
- Profiles stored in Supabase (auth.users) and custom profiles table
- Minimal business logic here (mostly CRUD)

---

#### **6. `app_services_project_files_info.md`** (14 KB)
**Purpose**: File upload, GitHub import, Supabase storage

**Covers**:
- Local file upload: validation, size limits, language constraints
- GitHub import: fetch files from connected repo, parse GitHub API
- Supabase Storage: upload to object storage, retrieve signed URLs
- Complex hybrid fetching: blobs for <50 files, zipball for 50+ files

**Key Takeaway**:
- Two upload paths: local (multipart) or from GitHub
- GitHub import uses hybrid strategy (API blobs vs zipball)
- Files stored in Supabase Storage with signed URLs for download
- Access control: only project owner can upload

---

#### **7. `app_services_projects_info.md`** (12 KB)
**Purpose**: Project CRUD operations

**Covers**:
- Create project (with team association)
- Read projects (filtered by user's team membership)
- Update project details
- Delete project (cascade deletes files)
- Bulk delete (multiple projects at once)
- Access control matrix (owner-only, team members can view)

**Key Takeaway**:
- Projects belong to teams
- Access control enforced: only team members can access
- Bulk operations available for efficiency
- Cascade deletes keep database clean

---

#### **8. `app_services_teams_info.md`** (26 KB)
**Purpose**: Team management + GitHub OAuth integration

**Most Complex Service** — Covers:
- Team CRUD (create, read, update, delete)
- Member management (invite, update role, remove)
- **GitHub App OAuth flow**: 
  - User clicks "Connect GitHub"
  - Redirected to GitHub for authorization
  - GitHub sends installation token back
  - Token stored in database
- Branch browsing: List branches, files per branch
- **Role-based access control**:
  - `admin`: Full team access
  - `developer`: Team access + file upload
  - `viewer`: View-only access
- Branch-level permissions: Viewer roles can access specific branches only

**Key Takeaway**:
- GitHub integration is sophisticated (OAuth + JWT signing)
- Installation tokens stored per team (not user PAT)
- Multi-tier access control: team role + branch restrictions
- GitHub App signs JWTs with RSA private key to get installation tokens

---

#### **9. `app_services_scans_info.md`** (18 KB)
**Purpose**: Vulnerability scanning pipeline (most technically complex)

**Covers 5 Scanner Service Files**:

1. **scanner_service.py**: Main orchestrator
   - Triggers scans on selected files
   - Calls AI scanner (LLM-based detection)
   - Stores results in database

2. **ai_scanner.py**: LLM integration
   - Calls FreeLLMAPI for AI vulnerability detection
   - Sends code + CWE definitions to LLM
   - Parses LLM response (vulnerabilities + risk scores)
   - Routes to different LLM providers (OpenAI, Llama, etc.)

3. **ast_parser.py**: Code analysis
   - Parses C/C++ code into Abstract Syntax Tree (AST)
   - Identifies potential vulnerability patterns
   - Extracts function calls, memory operations, etc.

4. **cwe_definitions.py**: Vulnerability library
   - Documents 26 C/C++ specific weaknesses
   - CWE-476: Null pointer dereference
   - CWE-119: Buffer overflow
   - CWE-242: Use of inherently dangerous function (strcpy)
   - etc.

5. **scan_storage_service.py**: Database persistence
   - Stores scan results in Supabase
   - Creates vulnerability records
   - Links to project files

**Scanning Flow**:
1. User selects files to scan
2. Backend fetches file content (from upload or GitHub)
3. AI scanner analyzes code with CWE definitions
4. LLM returns vulnerabilities + risk scores
5. Results stored in database
6. Frontend displays findings

**Key Takeaway**:
- Scanning is a 3-step pipeline: Fetch → Analyze → Store
- AI/LLM used for detection (not hardcoded rules)
- 26 CWE vulnerabilities defined for C/C++
- Results include location, severity, description, fix

---

### **Phase 4: Database & Infrastructure (Advanced)**
These files explain the database schema and deployment.

#### **10. `app_scripts_migrations_info.md`** (23 KB)
**Purpose**: Database schema and RLS (Row-Level Security) policies

**Covers 5 SQL Migration Files**:

1. **001_enable_realtime.sql**: Enable Realtime CDC
   - Allows frontend WebSocket subscriptions (live updates)

2. **002_create_projects_table.sql**: Projects schema
   - Columns: id, team_id, name, language, created_at
   - Foreign keys: team_id references teams
   - RLS: Only team members can read/write

3. **003_create_project_files_bucket.sql**: Supabase Storage
   - Object bucket for file uploads
   - Storage RLS: Only project owner can upload

4. **004_create_project_files_table.sql**: File metadata
   - Columns: id, project_id, filename, file_path, size, language
   - Foreign key: project_id references projects
   - Cascade delete: Remove files when project deleted
   - RLS: Only team members can read

5. **005_create_teams_table.sql**: Teams schema
   - Columns: id, owner_id, name, github_repo, installation_token
   - Installation token stored encrypted

**Key Concepts**:
- **RLS Policies**: Database enforces permissions (not just API layer)
- **Cascade deletes**: Deleting project auto-deletes its files
- **Foreign keys**: Maintain referential integrity
- **Realtime subscriptions**: Frontend can subscribe to live updates

**Key Takeaway**:
- Database schema 5 tables (users, teams, projects, files, scans)
- RLS enforces multi-tenant isolation (users can't see other teams' data)
- Migrations are idempotent (safe to run multiple times)
- Storage bucket has separate RLS layer

---

#### **11. `app_testsfile_info.md`** (24 KB)
**Purpose**: Test coverage with property-based testing

**Covers**:
- 7 properties tested with Hypothesis (100+ examples per property)
- 12 test methods across project service tests
- Mock Supabase client (isolated unit tests)
- Property-based testing: Generate random inputs, verify invariants

**Key Properties Tested**:
- Project creation maintains team associations
- Bulk delete doesn't affect other teams
- File uploads respect project language constraints
- Access control enforced (users can't access other teams' projects)

**Key Takeaway**:
- Comprehensive test coverage with property-based approach
- Tests use Hypothesis to generate 100+ random test cases per property
- Supabase client mocked (tests don't hit real database)

---

#### **12. `app_backend_freellmapi_dir_info.md`** (13 KB)
**Purpose**: External third-party LLM service (temporary integration)

**⚠️ Important**: This is NOT custom code. This is an imported repository from the internet.

**Status**: Planned for removal (external dependency only)

**Covers**:
- FreeLLMAPI architecture (aggregates multiple LLM providers)
- Supported providers: OpenAI, Llama, Mistral, Hugging Face, etc.
- Rate limiting per provider (RPM, TPM, etc.)
- Request routing and fallback logic

**Key Takeaway**:
- Not part of core SecureGuard development
- Used only for AI vulnerability detection
- Will be removed/replaced in future
- External dependency managed separately

---

## 🗺️ Understanding the Architecture

### Data Flow Examples

#### **Example 1: Upload a File and Scan**
1. User logs in → `GET /auth/me` (get current user)
2. User navigates to project → `GET /projects/{id}` (fetch project)
3. User uploads file → `POST /projects/{id}/files` (multipart upload)
   - File stored in Supabase Storage
   - Metadata stored in project_files table
4. User triggers scan → `POST /teams/{id}/scans`
   - Backend fetches file content
   - Passes to AI scanner with CWE definitions
   - LLM detects vulnerabilities
   - Results stored in scans table
5. Frontend subscribes to results → Realtime WebSocket (live updates)

**Services Involved**: file_service → scan_storage_service → ai_scanner → scanner_service

---

#### **Example 2: Connect GitHub Repository**
1. User clicks "Connect GitHub" → `GET /teams/{id}/github/authorize`
   - Backend generates GitHub App authorization URL
   - User redirected to GitHub
2. User approves → GitHub redirects to `/teams/github/callback`
   - Backend receives `code` parameter
   - Exchanges code for installation token
   - Token stored in teams table
3. User selects repo → `POST /teams/{id}/github/select-repo`
4. User views files → `GET /teams/{id}/branches/{branch}/files`
   - Backend fetches files from GitHub using installation token
   - Filters for C/C++ files only

**Services Involved**: github_service → team_service → scanner_service

---

#### **Example 3: Team Collaboration**
1. Team owner creates team → `POST /teams`
2. Owner invites member → `POST /teams/{id}/members`
3. Member has role "developer" (not owner)
   - Can upload files ✅
   - Can view team projects ✅
   - Cannot delete team ❌
   - Cannot manage members ❌
4. Member views specific branch → `GET /teams/{id}/branches/{branch}/files`
   - If role is "viewer" + branch not in allowed list: 403 Forbidden

**Access Control**: Checked in routers + RLS policies enforced in database

---

## 🔐 Security Model

### Authentication
- **JWT tokens** issued by Supabase Auth
- Every request includes `Authorization: Bearer <token>`
- `get_current_user()` validates token and extracts user ID
- All routes require authentication (except `/health`)

### Authorization (Access Control)
- **User level**: Must be authenticated
- **Team level**: Must be team member (admin/developer/viewer)
- **Project level**: Must be team member
- **File level**: Must be team member (if viewer, must be in branch-allowed list)
- **Branch level**: Viewer role restricted to specific branches only

### Data Isolation
- **RLS policies** in Supabase enforce multi-tenant isolation
- User can only read/write their own teams' data
- Service role key (backend only) used for admin operations

### Secrets Management
- API keys stored in `.env` (git-ignored)
- Never committed to repository
- Injected at runtime (Docker, deployment platform)
- Supabase keys separated (anon key for frontend, service role for backend)

---

## 📊 Key Statistics

| Metric | Count |
|--------|-------|
| **HTTP Endpoints** | 25+ |
| **Pydantic Models** | 30+ |
| **Database Tables** | 5 |
| **Service Modules** | 12+ |
| **CWE Vulnerabilities** | 26 |
| **Test Properties** | 7 |
| **Python Packages** | 8 |
| **Documentation Files** | 12 |
| **Total Documentation** | ~211 KB |

---

## ❓ FAQ for New Developers

### "Where do I start?"
→ Read this file first, then follow the reading flow: Infrastructure → Models → Routers → Services → Database

### "How do I add a new endpoint?"
1. Define request/response models in `app/models/{feature}.py`
2. Create router in `app/routers/{feature}.py`
3. Implement business logic in `app/services/{feature}/`
4. Add access control checks (see `get_current_user()`)
5. Add tests in `tests/`

### "How do I understand GitHub integration?"
→ Read `app_services_teams_info.md`, search for "GitHub OAuth flow"

### "How does scanning work?"
→ Read `app_services_scans_info.md`, follow the "Scanning Flow" section

### "What's the database schema?"
→ Read `app_scripts_migrations_info.md`, each migration adds/modifies tables

### "How do I run the backend?"
→ Read `backend_env_dockerfile_requirements_dockerignore_info.md`, "Development Workflow" section

### "How do I add authentication to a new endpoint?"
→ Use `get_current_user` dependency injection (see `app_config_main_dependencies_info.md`)

### "What are CWE vulnerabilities?"
→ Read `app_services_scans_info.md`, search for "CWE Definitions"

---

## 🚀 Quick Reference

### Files by Purpose

**Understanding the Infrastructure**:
- `backend_env_dockerfile_requirements_dockerignore_info.md` — Docker, environment, Python packages

**Understanding the API**:
- `app_routers_dir_info.md` — All HTTP endpoints
- `app_models_dir_info.md` — Request/response schemas

**Understanding Business Logic**:
- `app_services_teams_info.md` — Team + GitHub integration
- `app_services_scans_info.md` — Vulnerability scanning
- `app_services_project_files_info.md` — File upload + GitHub import
- `app_services_projects_info.md` — Project CRUD

**Understanding Foundation**:
- `app_config_main_dependencies_info.md` — App initialization
- `app_services_auth.md` — User profiles

**Understanding Storage & Quality**:
- `app_scripts_migrations_info.md` — Database schema
- `app_testsfile_info.md` — Test coverage

**Understanding External Dependencies**:
- `app_backend_freellmapi_dir_info.md` — Temporary LLM service

---

## 📝 Document Legend

Each documentation file follows this consistent structure:

1. **Purpose**: What this component does
2. **Overview**: High-level summary
3. **Imports**: What other modules it depends on
4. **Classes/Functions**: Detailed breakdown of each
5. **Parameters**: Input validation and constraints
6. **Return Values**: What gets returned and why
7. **Database Operations**: SQL queries, joins, filters
8. **Error Handling**: What exceptions are raised
9. **Use Cases**: Real-world examples
10. **Access Control**: Who can do what

---

## 🎯 Next Steps After Reading

1. **Explore the actual code**: Open `backend/app/` and compare with documentation
2. **Set up local development**: Follow `.env.example` and run `uvicorn app.main:app --reload`
3. **Try the API**: Visit `http://localhost:8000/docs` for interactive API documentation
4. **Run tests**: Execute `pytest` to verify everything works
5. **Make a small change**: Add a field to a Pydantic model, see how it flows through the system

---

## 📞 Questions?

If you're still confused about a component:
1. Check the corresponding documentation file
2. Search for "Key Takeaway" sections
3. Look for the "Use Cases" or "Example Flow" sections
4. Read the actual source code (comparison with docs)

---

**Total Documentation**: 12 comprehensive markdown files covering infrastructure, data models, HTTP endpoints, business logic, database schema, and testing.

**Documentation Strategy**: Each file is self-contained but references others. Start with foundation files, then move to business logic files.

**Accuracy**: All documentation written from actual source code analysis, not assumptions. Every function, class, and SQL query traced and documented.

---

**Start Reading**: Begin with `backend_env_dockerfile_requirements_dockerignore_info.md` →→→ Then follow the reading flow above.

Good luck exploring the codebase! 🚀
