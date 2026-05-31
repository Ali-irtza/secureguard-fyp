# Backend App Routers Directory Documentation

This document provides comprehensive information about all the API route handlers defined in the `backend/app/routers` folder. These routers expose FastAPI endpoints that the frontend calls to perform operations.

---

## auth.py

### Purpose
Handles all authentication and user profile related endpoints. Provides endpoints for retrieving current user info and updating user profiles.

### Imports
- `APIRouter` from `fastapi` - Creates a router instance to group related routes
- `Depends` from `fastapi` - Dependency injection for extracting dependencies like current user
- `Client` from `supabase` - Supabase database client
- `get_supabase, get_current_user` from `app.dependencies` - Dependency functions that provide Supabase client and authenticated user
- `MeResponse, ProfileUpdateRequest, ProfileResponse` from `app.models.auth` - Pydantic schemas for validation
- `get_user_profile, upsert_user_profile` from `app.services.auth.profile_service` - Business logic functions

### Endpoints

#### GET /auth/me
- **Purpose**: Returns the current authenticated user's complete profile data
- **Access**: Requires valid JWT in Authorization header
- **Parameters**: 
  - `current_user` (dependency) - Extracted from JWT token
  - `supabase` (dependency) - Database client
- **Request Body**: None
- **Response Model**: `MeResponse` containing id, email, full_name, avatar_url, created_at
- **Logic Flow**:
  1. Get current user from JWT
  2. Call `get_user_profile()` to fetch user data combining auth.users (email) and profiles table (name, avatar)
  3. Return merged profile data
- **Use Case**: Frontend calls on app load to populate dashboard header with user info

#### POST /auth/profile
- **Purpose**: Creates or updates the current user's profile data using upsert logic
- **Access**: Requires valid JWT
- **Parameters**:
  - `current_user` (dependency) - Authenticated user
  - `supabase` (dependency) - Database client
- **Request Body**: `ProfileUpdateRequest` containing:
  - `full_name: Optional[str]` - User's full name (optional)
  - `avatar_url: Optional[str]` - URL to user's avatar image (optional)
- **Response Model**: `ProfileResponse` with id, full_name, avatar_url, created_at, updated_at
- **Logic Flow**:
  1. Get current user from JWT
  2. Call `upsert_user_profile()` which inserts or updates based on user_id
  3. Only provided (non-None) fields are updated
  4. Return updated profile
- **Use Case**: Called after signup to save name or from Settings page to update profile

---

## project_files.py

### Purpose
Handles file upload, import, listing, and deletion operations for project files. Supports both local uploads and GitHub imports.

### Imports
- `APIRouter, Depends, UploadFile, File, status` from `fastapi` - Core FastAPI components
- `Client` from `supabase` - Database client
- `get_supabase, get_current_user` from `app.dependencies` - Dependency injection
- `GitHubImportRequest, ProjectFileListResponse, ProjectFileResponse, ProjectFileDeleteResponse` from `app.models.project_files` - Schema models
- `file_service` from `app.services.project_files` - Business logic service

### Endpoints

#### GET /{project_id}/files
- **Purpose**: List all files in a project with source tags (local vs GitHub)
- **Access**: Requires authentication, user must have project access
- **Parameters**:
  - `project_id: str` (path) - ID of project to list files from
  - `current_user` (dependency) - Authenticated user
  - `supabase` (dependency) - Database client
- **Response Model**: `ProjectFileListResponse` containing array of files with metadata
- **Logic**: Calls `file_service.list_project_files()` to fetch all files and their tags
- **Use Case**: Frontend displays project file list in UI

#### POST /{project_id}/files
- **Purpose**: Upload a local source code file to a project
- **Access**: Requires authentication
- **Parameters**:
  - `project_id: str` (path) - Destination project ID
  - `file: UploadFile` (form data) - The file being uploaded
  - `current_user` (dependency) - Authenticated user
  - `supabase` (dependency) - Database client
- **Response Model**: `ProjectFileResponse` with file metadata
- **Status Code**: 201 CREATED
- **Constraints**:
  - File extensions enforced by project language (C → .c/.h, C++ → .cpp, etc.)
  - Maximum file size: 10 MB
- **Logic**: Calls `file_service.upload_project_file()` to store file and create database record
- **Use Case**: User uploads source files for scanning

#### POST /{project_id}/files/github-import
- **Note**: MUST be registered BEFORE `/{project_id}/files/{filename}` to prevent "github-import" being captured as filename
- **Purpose**: Import a single file from the team's connected GitHub repository
- **Access**: Requires authentication + specific permissions
- **Parameters**:
  - `project_id: str` (path) - Target project
  - `body: GitHubImportRequest` - Request body containing:
    - Repository details
    - Branch name
    - File path in repo
  - `current_user` (dependency) - Authenticated user
  - `supabase` (dependency) - Database client
- **Response Model**: `ProjectFileResponse`
- **Status Code**: 201 CREATED
- **Access Control**:
  - Project must be a team project with connected GitHub repo
  - Only admins and developers can import
  - Developers may only import from their assigned branches
  - File extension must match project language
- **Logic Flow**:
  1. Validate project has GitHub connection
  2. Check user permissions and branch assignments
  3. Fetch file from GitHub once
  4. Save to Supabase Storage
  5. Tag with source="github" and originating branch
  6. Create database record
- **Use Case**: Import existing code from GitHub instead of uploading

#### DELETE /{project_id}/files/{filename}
- **Purpose**: Delete a single file from a project
- **Access**: Owner only
- **Parameters**:
  - `project_id: str` (path) - Project containing file
  - `filename: str` (path) - Name of file to delete
  - `current_user` (dependency) - Authenticated user
  - `supabase` (dependency) - Database client
- **Response Model**: `ProjectFileDeleteResponse` with deletion confirmation
- **Logic**: Calls `file_service.delete_project_file()` which removes file and database record
- **Use Case**: Remove unwanted files from project

---

## projects.py

### Purpose
Handles all project management operations including CRUD, bulk operations, and project listing.

### Imports
- `APIRouter, Depends, status` from `fastapi` - Core FastAPI
- `Client` from `supabase` - Database client
- `get_supabase, get_current_user` from `app.dependencies` - Dependency injection
- `ProjectCreateRequest, ProjectUpdateRequest, BulkDeleteRequest, ProjectResponse, ProjectListResponse, BulkDeleteResponse` from `app.models.projects` - Schemas
- `project_service` from `app.services.projects` - Business logic

### Route Ordering Note
**Important**: The DELETE `/bulk-delete` route MUST be registered BEFORE `/{project_id}`. FastAPI matches routes in registration order. If `/{project_id}` came first, the literal string "bulk-delete" would be incorrectly captured as a project_id path parameter.

### Endpoints

#### GET /
- **Purpose**: List all projects for the authenticated user
- **Access**: Requires authentication
- **Parameters**:
  - `current_user` (dependency) - Authenticated user
  - `supabase` (dependency) - Database client
- **Response Model**: `ProjectListResponse` containing array of projects with pagination
- **Logic**: Calls `project_service.list_user_projects()` to fetch user's projects
- **Use Case**: Dashboard displays user's projects

#### POST /
- **Purpose**: Create a new project
- **Access**: Requires authentication
- **Parameters**:
  - `body: ProjectCreateRequest` containing:
    - `project_name: str` - Name of new project
    - `description: Optional[str]` - Project description
    - `team_id: Optional[str]` - Optional team association
  - `current_user` (dependency) - Authenticated user
  - `supabase` (dependency) - Database client
- **Response Model**: `ProjectResponse` with created project details
- **Status Code**: 201 CREATED
- **Logic**: Calls `project_service.create_project()` to create and save project
- **Use Case**: User creates new project

#### DELETE /bulk-delete
- **Note**: MUST come before `/{project_id}` route
- **Purpose**: Delete multiple projects at once
- **Access**: Requires authentication
- **Parameters**:
  - `body: BulkDeleteRequest` containing:
    - `ids: List[str]` - IDs of projects to delete
  - `current_user` (dependency) - Authenticated user
  - `supabase` (dependency) - Database client
- **Response Model**: `BulkDeleteResponse` with deletion status
- **Logic**: Calls `project_service.bulk_delete_projects()` to delete all specified projects
- **Use Case**: Clean up multiple projects at once

#### GET /{project_id}
- **Purpose**: Retrieve details of a single project
- **Access**: Requires authentication, user must have access to project
- **Parameters**:
  - `project_id: str` (path) - ID of project to fetch
  - `current_user` (dependency) - Authenticated user
  - `supabase` (dependency) - Database client
- **Response Model**: `ProjectResponse` with project details
- **Logic**: Calls `project_service.get_project_by_id()` to fetch project
- **Use Case**: View project details

#### PATCH /{project_id}
- **Purpose**: Update a project's properties
- **Access**: Requires authentication
- **Parameters**:
  - `project_id: str` (path) - Project to update
  - `body: ProjectUpdateRequest` containing:
    - `project_name: Optional[str]` - New name
    - `description: Optional[str]` - New description
    - `status: Optional[ProjectStatus]` - New status
  - `current_user` (dependency) - Authenticated user
  - `supabase` (dependency) - Database client
- **Response Model**: `ProjectResponse` with updated project
- **Logic**: Calls `project_service.update_project()` to update only provided fields
- **Use Case**: Edit project properties or change status

#### DELETE /{project_id}
- **Purpose**: Delete a single project
- **Access**: Requires authentication
- **Parameters**:
  - `project_id: str` (path) - Project to delete
  - `current_user` (dependency) - Authenticated user
  - `supabase` (dependency) - Database client
- **Response**: No content (204)
- **Status Code**: 204 NO_CONTENT
- **Logic**: Calls `project_service.delete_project()` to delete project and related data
- **Use Case**: Remove project from system

---

## scans.py

### Purpose
Handles security scanning operations including GitHub scanning, file upload scanning, scan history, and scan details retrieval.

### Imports
- `time` - For measuring scan duration
- `APIRouter, Depends` from `fastapi` - Core routing
- `Client` from `supabase` - Database client
- `get_supabase, get_current_user` from `app.dependencies` - Dependency injection
- `BranchFilesResponse, ScanRequest, ScanResponse, UploadScanRequest` from `app.models.scans` - Schemas
- `scanner_service` from `app.services.scans` - Scanning service
- `create_scan_record, save_vulnerabilities, get_scans_for_user, get_scan_with_vulnerabilities` from `app.services.scans.scan_storage_service` - Database operations

### Endpoints

#### GET /{team_id}/github/files
- **Purpose**: Returns list of all C/C++ file paths for a given branch in connected GitHub repo
- **Access**: Requires authentication
- **Parameters**:
  - `team_id: str` (path) - Team with GitHub connection
  - `branch: str` (query) - Git branch name to list files from
  - `current_user` (dependency) - Authenticated user
  - `supabase` (dependency) - Database client
- **Response Model**: `BranchFilesResponse` containing files array
- **Logic**: Calls `scanner_service.fetch_branch_files()` to list C/C++ files from branch
- **Use Case**: Frontend populates file selector for scanning

#### POST /{team_id}/scans
- **Purpose**: Fetches files from GitHub, scans them for vulnerabilities, and saves results
- **Access**: Requires authentication
- **Parameters**:
  - `team_id: str` (path) - Team with GitHub connection
  - `body: ScanRequest` containing:
    - `branch: str` - Git branch to scan
    - `selected_files: List[str]` - Specific files to scan
    - `project_name: str` - Project name for records
    - `project_id: str` - Project ID for database
  - `current_user` (dependency) - Authenticated user
  - `supabase` (dependency) - Database client
- **Response Model**: `ScanResponse` with scan results
- **Logic Flow**:
  1. Record start time
  2. Call `scanner_service.fetch_selected_code_hybrid()` to get file contents from GitHub
  3. Call `scanner_service.run_vulnerability_scanner()` to scan files (async)
  4. Calculate scan duration
  5. Save scan record via `create_scan_record()`
  6. Save vulnerabilities via `save_vulnerabilities()`
  7. Return results with scan_id (or None if save fails)
- **Error Handling**: If database save fails, still returns scan results but with null scan_id
- **Use Case**: Scan GitHub repository files for security vulnerabilities

#### POST /scan/upload
- **Purpose**: Scans a single uploaded file and saves results to database
- **Access**: Requires authentication
- **Parameters**:
  - `body: UploadScanRequest` containing:
    - `filename: str` - Name of file being scanned
    - `source_code: str` - Raw source code content
    - `project_name: str` - Project name
    - `project_id: str` - Project ID
  - `current_user` (dependency) - Authenticated user
  - `supabase` (dependency) - Database client
- **Response Model**: `ScanResponse` with vulnerability findings
- **Logic Flow**:
  1. Record start time
  2. Create files dict: {filename: source_code}
  3. Run scanner via `scanner_service.run_vulnerability_scanner()`
  4. Calculate duration
  5. Save scan record with scan_type="upload"
  6. Save vulnerabilities
  7. Return results with scan_id
- **Error Handling**: Same as GitHub scan - returns results even if DB save fails
- **Use Case**: Scan files uploaded directly by user without GitHub

#### GET /scans/history
- **Purpose**: Returns all past scans performed by the authenticated user
- **Access**: Requires authentication
- **Parameters**:
  - `current_user` (dependency) - Authenticated user
  - `supabase` (dependency) - Database client
- **Response Model**: `list[dict]` - Array of scan records
- **Logic**: Calls `get_scans_for_user()` to fetch all user's scans
- **Use Case**: Display scan history in frontend

#### GET /scans/{scan_id}
- **Purpose**: Returns a single scan with complete vulnerability list
- **Access**: Requires authentication
- **Parameters**:
  - `scan_id: str` (path) - ID of scan to retrieve
  - `current_user` (dependency) - Authenticated user
  - `supabase` (dependency) - Database client
- **Response Model**: `dict` - Scan details with vulnerabilities array
- **Logic**: Calls `get_scan_with_vulnerabilities()` to fetch scan and all findings
- **Use Case**: View detailed scan results with all vulnerabilities and remediation info

---

## teams.py

### Purpose
Comprehensive team management including CRUD, member management, GitHub integration, and file operations.

### Imports
- `APIRouter, Depends, status` from `fastapi` - Core routing
- `RedirectResponse` from `fastapi.responses` - HTTP redirect
- `Client` from `supabase` - Database client
- `get_supabase, get_current_user` from `app.dependencies` - Dependency injection
- `TeamCreateRequest, TeamUpdateRequest, ConnectGithubRequest, InviteMemberRequest, UpdateMemberRequest, TeamResponse, TeamListResponse, TeamMemberResponse, GithubAuthorizeResponse, BranchFilesResponse, FileContentResponse` from `app.models.teams` - Schemas
- `team_service, member_service, github_service` from `app.services.teams` - Business logic services

### Endpoints

#### GET /
- **Purpose**: List all teams the authenticated user is member of
- **Access**: Requires authentication
- **Parameters**:
  - `current_user` (dependency) - Authenticated user
  - `supabase` (dependency) - Database client
- **Response Model**: `TeamListResponse` containing teams array
- **Logic**: Calls `team_service.list_user_teams()` to fetch teams for user
- **Use Case**: Display teams in user dashboard

#### POST /
- **Purpose**: Create a new team
- **Access**: Requires authentication
- **Parameters**:
  - `body: TeamCreateRequest` containing:
    - `name: str` - Team name
  - `current_user` (dependency) - Authenticated user
  - `supabase` (dependency) - Database client
- **Response Model**: `TeamResponse` with created team
- **Status Code**: 201 CREATED
- **Logic**: Calls `team_service.create_new_team()` with user as owner
- **Use Case**: User creates new team

#### GET /{team_id}
- **Purpose**: Get details of a specific team
- **Access**: Requires authentication, user must be team member
- **Parameters**:
  - `team_id: str` (path) - Team ID
  - `current_user` (dependency) - Authenticated user
  - `supabase` (dependency) - Database client
- **Response Model**: `TeamResponse` with team details
- **Logic**: Calls `team_service.get_team_by_id()`
- **Use Case**: View team information

#### PATCH /{team_id}
- **Purpose**: Update team properties
- **Access**: Requires authentication
- **Parameters**:
  - `team_id: str` (path) - Team to update
  - `body: TeamUpdateRequest` containing:
    - `name: Optional[str]` - New team name
    - `github_repo: Optional[str]` - GitHub repo info
  - `current_user` (dependency) - Authenticated user
  - `supabase` (dependency) - Database client
- **Response Model**: `TeamResponse` with updated team
- **Logic**: Calls `team_service.update_team_details()`
- **Use Case**: Edit team properties

#### DELETE /{team_id}
- **Purpose**: Delete a team
- **Access**: Owner only
- **Parameters**:
  - `team_id: str` (path) - Team to delete
  - `current_user` (dependency) - Authenticated user
  - `supabase` (dependency) - Database client
- **Status Code**: 204 NO_CONTENT
- **Logic**: Calls `team_service.delete_team_by_id()`
- **Use Case**: Remove team

#### POST /{team_id}/github
- **Purpose**: Connect a GitHub repository to the team
- **Access**: Requires authentication
- **Parameters**:
  - `team_id: str` (path) - Team to connect
  - `body: ConnectGithubRequest` containing:
    - `repo_url: str` - GitHub repo URL
    - `pat: str` - Personal Access Token
  - `current_user` (dependency) - Authenticated user
  - `supabase` (dependency) - Database client
- **Response Model**: `TeamResponse` with updated team
- **Logic**: Calls `github_service.connect_github_repo()` to validate and store connection
- **Use Case**: Link GitHub repository to team

#### POST /{team_id}/github/refresh
- **Purpose**: Refresh GitHub branch list using new/updated credentials
- **Access**: Requires authentication
- **Parameters**:
  - `team_id: str` (path) - Team with GitHub connection
  - `body: ConnectGithubRequest` containing:
    - `repo_url: str` - GitHub repo URL
    - `pat: str` - Updated Personal Access Token
  - `current_user` (dependency) - Authenticated user
  - `supabase` (dependency) - Database client
- **Response Model**: `TeamResponse`
- **Logic**: Calls `github_service.refresh_branches()` to re-fetch available branches
- **Use Case**: Update GitHub connection after credentials change

#### POST /{team_id}/github/sync-branches
- **Purpose**: Re-sync branches for connected repo using stored GitHub App installation token
- **Access**: Requires authentication
- **Parameters**:
  - `team_id: str` (path) - Team with GitHub App installed
  - `current_user` (dependency) - Authenticated user
  - `supabase` (dependency) - Database client
- **Request Body**: None (no PAT or refresh needed)
- **Response Model**: `TeamResponse`
- **Logic**: Calls `github_service.sync_branches()` using stored installation token
- **Use Case**: Pull latest branches without re-entering credentials

#### GET /github/callback
- **Purpose**: OAuth callback endpoint for GitHub App authorization
- **Access**: Public (callback from GitHub)
- **Parameters**:
  - `installation_id: int | None` - GitHub App installation ID
  - `setup_action: str | None` - Setup action type
  - `state: str | None` - State token for CSRF protection
  - `code: str | None` - Authorization code
  - `supabase` (dependency) - Database client
- **Response**: Redirect response
- **Logic**: Calls `github_service.process_github_callback()` to handle OAuth completion
- **Use Case**: GitHub redirects here after user authorizes app

#### GET /{team_id}/github/authorize
- **Purpose**: Generate GitHub authorization URL for OAuth flow
- **Access**: Requires authentication
- **Parameters**:
  - `team_id: str` (path) - Team to authorize for
  - `current_user` (dependency) - Authenticated user
  - `supabase` (dependency) - Database client
- **Response Model**: `GithubAuthorizeResponse` containing:
  - Authorization URL to redirect user to
  - State token for verification
- **Logic**: Calls `github_service.generate_github_authorize_url()`
- **Use Case**: Get OAuth URL to send user to GitHub

#### GET /{team_id}/github/repos
- **Purpose**: List all repositories accessible via team's GitHub App installation
- **Access**: Requires authentication
- **Parameters**:
  - `team_id: str` (path) - Team with GitHub App
  - `current_user` (dependency) - Authenticated user
  - `supabase` (dependency) - Database client
- **Response Model**: Repository list
- **Logic**: Calls `github_service.fetch_installation_repos()` to get repos from GitHub App
- **Use Case**: Show available repos for selection

#### POST /{team_id}/github/select-repo
- **Purpose**: Select/configure which repo the team will use for scans
- **Access**: Requires authentication
- **Parameters**:
  - `team_id: str` (path) - Team to configure
  - `body: dict` containing:
    - `repo_full_name: str` - Full name (owner/repo)
    - `repo_url: str` - Repository URL
  - `current_user` (dependency) - Authenticated user
  - `supabase` (dependency) - Database client
- **Response Model**: `TeamResponse` with updated repo selection
- **Logic**: Calls `github_service.select_installation_repo()` to save selection
- **Use Case**: Choose primary repo for team

#### POST /{team_id}/members
- **Purpose**: Invite a new user to join the team
- **Access**: Admin/Owner only
- **Parameters**:
  - `team_id: str` (path) - Team to invite to
  - `body: InviteMemberRequest` containing:
    - `email: str` - Email of user to invite (must exist in system)
    - `role: MemberRole` - Role to assign (MEMBER, VIEWER, ADMIN)
  - `current_user` (dependency) - Authenticated user
  - `supabase` (dependency) - Database client
- **Response Model**: `TeamMemberResponse` with new member info
- **Status Code**: 201 CREATED
- **Logic**: Calls `member_service.invite_user_to_team()` to add member with role
- **Use Case**: Add team member

#### PATCH /{team_id}/members/{member_user_id}
- **Purpose**: Update a team member's role and branch assignments
- **Access**: Admin/Owner only
- **Parameters**:
  - `team_id: str` (path) - Team containing member
  - `member_user_id: str` (path) - User ID of member to update
  - `body: UpdateMemberRequest` containing:
    - `role: Optional[MemberRole]` - New role
    - `branches: Optional[List[str]]` - Assigned branches (for developers)
  - `current_user` (dependency) - Authenticated user
  - `supabase` (dependency) - Database client
- **Response Model**: `TeamMemberResponse` with updated member
- **Logic**: Calls `member_service.update_team_member()` to update role/branches
- **Use Case**: Change member permissions or branch access

#### DELETE /{team_id}/members/{member_user_id}
- **Purpose**: Remove a member from the team
- **Access**: Admin/Owner only
- **Parameters**:
  - `team_id: str` (path) - Team to remove from
  - `member_user_id: str` (path) - User ID to remove
  - `current_user` (dependency) - Authenticated user
  - `supabase` (dependency) - Database client
- **Status Code**: 204 NO_CONTENT
- **Logic**: Calls `member_service.remove_team_member()`
- **Use Case**: Remove team member

#### GET /{team_id}/branches/{branch:path}/files/content
- **Purpose**: Fetch content of a specific file from GitHub at given branch
- **Access**: Requires authentication
- **Parameters**:
  - `team_id: str` (path) - Team with GitHub connection
  - `branch: str` (path, with :path modifier to allow slashes) - Git branch name
  - `path: str` (query) - File path in repository
  - `current_user` (dependency) - Authenticated user
  - `supabase` (dependency) - Database client
- **Response Model**: `FileContentResponse` containing:
  - File path
  - Raw file content
  - File size
- **Logic**: Calls `github_service.fetch_file_content()` to download file from GitHub
- **Note**: Uses :path modifier to allow branch names containing slashes (release/v1.0)
- **Use Case**: View file content in editor before importing

#### GET /{team_id}/branches/{branch:path}/files
- **Purpose**: List all C/C++ files in a specific branch
- **Access**: Requires authentication
- **Parameters**:
  - `team_id: str` (path) - Team with GitHub connection
  - `branch: str` (path, with :path modifier) - Git branch
  - `current_user` (dependency) - Authenticated user
  - `supabase` (dependency) - Database client
- **Response Model**: `BranchFilesResponse` containing files array
- **Logic**: Calls `github_service.fetch_branch_files()` to list files
- **Note**: Uses :path modifier to handle complex branch names
- **Use Case**: Browse files available in a branch for import/scanning

---

## Summary

The routers directory contains 5 core route files handling API endpoints:

1. **auth.py**: User authentication and profile endpoints (2 endpoints)
   - GET /me - Get current user profile
   - POST /profile - Update/create profile

2. **project_files.py**: File management endpoints (4 endpoints)
   - GET /{project_id}/files - List project files
   - POST /{project_id}/files - Upload local file
   - POST /{project_id}/files/github-import - Import from GitHub
   - DELETE /{project_id}/files/{filename} - Delete file

3. **projects.py**: Project CRUD operations (6 endpoints)
   - GET / - List user projects
   - POST / - Create project
   - DELETE /bulk-delete - Delete multiple projects
   - GET /{project_id} - Get project
   - PATCH /{project_id} - Update project
   - DELETE /{project_id} - Delete project

4. **scans.py**: Security scanning operations (5 endpoints)
   - GET /{team_id}/github/files - List files from GitHub branch
   - POST /{team_id}/scans - Scan GitHub files
   - POST /scan/upload - Scan uploaded file
   - GET /scans/history - Get user's scan history
   - GET /scans/{scan_id} - Get scan details with vulnerabilities

5. **teams.py**: Team and GitHub integration (15+ endpoints)
   - CRUD: GET /, POST /, GET /{team_id}, PATCH /{team_id}, DELETE /{team_id}
   - GitHub integration: connect, refresh, sync, authorize, list repos, select repo
   - Member management: invite, update, remove
   - File operations: list files, get file content

**Key Patterns**:
- All endpoints require `current_user` dependency (JWT authentication)
- All endpoints receive `supabase` client for database operations
- Request validation via Pydantic models
- Response models ensure consistent API contracts
- Business logic delegated to service layer
- Route ordering matters (especially for path parameters vs literals)
- GitHub operations support OAuth app integration
- Member management supports role-based access control
