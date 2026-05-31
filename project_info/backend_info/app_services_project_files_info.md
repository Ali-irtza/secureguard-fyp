# Backend App Services Project Files Documentation

This document provides comprehensive information about the project files services defined in `backend/app/services/project_files`. These services handle file uploads, imports, listing, and deletion operations for project source code files.

---

## Directory Structure

```
backend/app/services/project_files/
├── __init__.py           # Package initialization
└── file_service.py       # File upload, import, and management logic
```

---

## __init__.py

### Purpose
Package initialization file for the project_files services module.

### Content
Marks the directory as a Python package enabling imports from this module.

### Use Case
Allows importing functions using:
```python
from app.services.project_files import file_service
```

---

## file_service.py

### Purpose
Comprehensive file management service handling local uploads, GitHub imports, file listing, and deletions. Manages both Supabase Storage (for file bytes) and database metadata.

### Constants

#### STORAGE_BUCKET
```python
STORAGE_BUCKET = "project-files"
```
- Name of Supabase Storage bucket where files are stored
- All files uploaded/imported go to this bucket

#### SIGNED_URL_EXPIRY_SECONDS
```python
SIGNED_URL_EXPIRY_SECONDS = 3600  # 1 hour
```
- Expiration time for signed download URLs
- URLs are valid for 1 hour after generation

### Imports
- `os` - For file path operations
- `base64` - For decoding GitHub API file content
- `HTTPException, status` from `fastapi` - Error handling
- `Client` from `supabase` - Database and storage client
- `List` from `typing` - Type hints
- `datetime, timezone` from `datetime` - Timestamp handling
- Various Pydantic models from `app.models.project_files` - Request/response schemas
- `httpx` (imported dynamically) - Async HTTP client for GitHub API calls

### Private Helper Functions

#### _require_project_access(project_id, user_id, supabase)
- **Purpose**: Validates user has access to project (view/list files)
- **Access Rules**:
  - Personal project → Owner only
  - Team project → Owner, team admin, or team developer
  - Viewer role → Denied
- **Returns**: Full project row if authorized
- **Raises**: 404 if project not found, 403 if unauthorized
- **Database Query**: Selects project (id, name, language, owner_id, type, team_id) and checks:
  1. Is user the owner?
  2. If team project: Is user admin or developer?

#### _require_project_owner(project_id, user_id, supabase)
- **Purpose**: Validates user owns the project (for delete operations)
- **Returns**: Project row if owner
- **Raises**: 404 if not found, 403 if not owner
- **Used For**: Delete operations which remain owner-only

#### _validate_extension(filename, language)
- **Purpose**: Ensures file extension matches project language
- **Logic**:
  1. Check if project has language set
  2. Get allowed extensions for language from ALLOWED_EXTENSIONS constant
  3. Extract file extension (e.g., .py, .cpp)
  4. Compare against allowed list
- **Raises**: 422 UNPROCESSABLE_ENTITY if extension not allowed
- **Error Message**: Lists allowed extensions
- **Example**: C project allows .c and .h files only

#### _storage_path(project_id, filename)
- **Purpose**: Generates canonical storage path for a file
- **Returns**: `"{project_id}/{filename}"` (e.g., "proj-123/main.cpp")
- **Used For**: Consistent path generation for all storage operations

#### _make_signed_url(storage_path, supabase)
- **Purpose**: Generates 1-hour signed download URL for file access
- **Parameters**: Storage path and Supabase client
- **Returns**: Signed URL string (valid for 1 hour)
- **Error Handling**: Returns empty string if URL generation fails

#### _upload_bytes(storage_path, content, content_type, supabase)
- **Purpose**: Uploads raw bytes to Supabase Storage
- **Parameters**:
  - `storage_path` - Where to store file
  - `content` - Raw file bytes
  - `content_type` - MIME type (e.g., "text/plain")
  - `supabase` - Database client
- **Behavior**: 
  - Upserts file (overwrites if exists at same path)
  - Sets upsert headers for Supabase Storage
- **Error Handling**: Raises exception if upload fails

#### _upsert_db_record(project_id, user_id, filename, storage_path, size, content_type, source, supabase, github_branch=None)
- **Purpose**: Creates or updates file metadata record in project_files table
- **Parameters**:
  - `source` - Either "local" or "github" (FILE_SOURCE_LOCAL or FILE_SOURCE_GITHUB)
  - `github_branch` - Branch name if imported from GitHub (optional)
- **Upsert Logic**: ON CONFLICT (project_id, filename) DO UPDATE
  - Prevents duplicates: Re-uploading same filename updates record
  - Allows file refresh/replacement
- **Payload Fields**:
  - project_id, uploaded_by, filename, storage_path
  - size, content_type, source, github_branch
- **Returns**: Upserted database row
- **Raises**: 500 if upsert fails

#### _db_row_to_response(row, supabase)
- **Purpose**: Converts database row to ProjectFileResponse with fresh signed URL
- **Logic**:
  1. Generate signed URL from storage_path
  2. Parse created_at timestamp (handles ISO format with Z)
  3. Build ProjectFileResponse with all fields
  4. Gracefully handle missing/malformed timestamps
- **Returns**: ProjectFileResponse object ready for API response

#### _require_team_member_role(team_id, user_id, supabase, allowed_roles)
- **Purpose**: Validates user is team member with required role
- **Parameters**: `allowed_roles` - List of permitted roles (e.g., ["admin", "developer"])
- **Returns**: Team membership row with role and branches
- **Raises**: 403 if not member or insufficient role
- **Used For**: GitHub import permission checks

#### _check_developer_branch_access(membership, branch)
- **Purpose**: Enforces branch restrictions for developer role
- **Logic**:
  1. If admin: Allow all branches
  2. If developer: Check if branch in assigned list
  3. If no branches assigned: Raise error
- **Raises**: 403 if developer accessing unassigned branch
- **Used For**: Security control to restrict developer access to specific branches

### Public Service Functions

#### list_project_files(project_id, user_id, supabase)
- **Purpose**: List all files in a project with fresh signed URLs
- **Flow**:
  1. Verify user has access via `_require_project_access()`
  2. Query project_files table for all rows matching project_id
  3. Order by created_at descending (newest first)
  4. Convert each row to ProjectFileResponse with signed URL
  5. Return ProjectFileListResponse
- **Returns**: `ProjectFileListResponse` containing array of files
- **Error Handling**: 404 if project not found, 403 if no access
- **Database Query**: SELECT * FROM project_files WHERE project_id = ? ORDER BY created_at DESC
- **Use Case**: Display file list in project UI

#### async upload_project_file(project_id, user_id, file, supabase)
- **Purpose**: Upload and validate a local source file
- **Flow**:
  1. Check project access and extract language
  2. Validate filename not empty
  3. Validate file extension matches language
  4. Read file content
  5. Validate file size ≤ 10 MB
  6. Reject empty files
  7. Upload bytes to storage
  8. Create/update database record
  9. Return response with signed URL
- **Validations**:
  - Filename not empty (422)
  - Extension allowed for language (422)
  - File size ≤ 10 MB (413)
  - File not empty (422)
- **Returns**: `ProjectFileResponse` with file metadata and signed URL
- **Error Handling**:
  - 404 - Project not found
  - 403 - No access
  - 422 - Invalid filename/extension/empty file
  - 413 - File too large
- **Storage**: Saves to "{project_id}/{filename}" in "project-files" bucket
- **Database**: Upserts with source="local"
- **Use Case**: User uploads source file for scanning

#### async import_github_file(project_id, user_id, body, supabase)
- **Purpose**: Import file from connected GitHub repository
- **Access Control** (hierarchical):
  1. User must have project access
  2. Project must be team project with connected repo
  3. User must be team admin or developer
  4. If developer: Can only import from assigned branches
  5. File extension must match project language
- **Flow**:
  1. Validate project and access
  2. Check team connection
  3. Verify user role (admin/developer)
  4. Check branch access for developers
  5. Fetch team's GitHub installation token
  6. Get installation ID from team record
  7. Get OAuth token from GitHub
  8. Validate file extension
  9. Fetch file from GitHub API:
     - Parse owner/repo from URL
     - Call `/repos/{owner}/{repo}/contents/{path}?ref={branch}`
     - Decode base64 content
  10. Validate file size ≤ 10 MB
  11. Upload bytes to storage
  12. Create/update database record with source="github" and branch info
  13. Return response
- **GitHub API Call**:
  - Method: GET /repos/{owner}/{repo}/contents/{path}
  - Headers: Bearer token, Accept application/vnd.github+json
  - Query: ref={branch}
  - Returns: Base64-encoded content
- **Parameters in Body**:
  - `file_path` - Path in GitHub repo
  - `branch` - Git branch to import from
- **Error Handling**:
  - 400 - Project not team project, no GitHub repo, no installation
  - 403 - Not admin/developer, developer access denied, not team member
  - 404 - File not found on branch
  - 422 - Invalid extension, can't decode content
  - 413 - File too large
  - 502 - GitHub API error
- **Database**: Upserts with source="github" and github_branch set
- **Use Case**: Import existing code directly from GitHub

#### delete_project_file(project_id, filename, user_id, supabase)
- **Purpose**: Delete file from storage and database
- **Access**: Owner only
- **Flow**:
  1. Verify user owns project
  2. Delete file from Supabase Storage
  3. Delete record from project_files table
  4. Return confirmation
- **Storage Operation**: Removes from storage bucket
- **Database Operation**: DELETE FROM project_files WHERE project_id=? AND filename=?
- **Returns**: `ProjectFileDeleteResponse` with deleted filename
- **Error Handling**: 404 if project not found, 403 if not owner
- **Use Case**: Remove unwanted files from project

---

## Database Tables Involved

### project_files Table
**Columns**:
- `id` (UUID, PRIMARY KEY) - Unique file record ID
- `project_id` (FK to projects) - Parent project
- `filename` (TEXT) - File name
- `storage_path` (TEXT) - Path in Supabase Storage
- `size` (INT) - File size in bytes
- `content_type` (TEXT) - MIME type
- `source` (TEXT) - "local" or "github"
- `github_branch` (TEXT, nullable) - Branch if imported from GitHub
- `uploaded_by` (FK to users) - User who uploaded/imported
- `created_at` (TIMESTAMP) - Upload time
- `updated_at` (TIMESTAMP) - Last modification

### projects Table (referenced)
**Columns queried**:
- `id` - Project ID
- `name` - Project name
- `language` - Programming language (determines allowed file types)
- `owner_id` - Project owner
- `type` - "personal" or "team"
- `team_id` - Associated team (if team project)

### team_members Table (referenced for GitHub imports)
**Columns queried**:
- `role` - Team member role (admin, developer, viewer)
- `branches` - Assigned branches for developers

### teams Table (referenced for GitHub imports)
**Columns queried**:
- `github_repo` - Connected repository URL
- `github_installation_id` - OAuth app installation ID

---

## Integration Points

### Called By
- **Routers**: `backend/app/routers/project_files.py`
  - `list_files()` → `list_project_files()`
  - `upload_file()` → `upload_project_file()`
  - `import_github_file()` → `import_github_file()`
  - `delete_file()` → `delete_project_file()`

### Calls To
- **Other Services**: `github_service` (for GitHub token generation)
- **External APIs**: GitHub API for file content retrieval
- **Supabase**: Storage and database operations

### Dependencies
- Supabase Client (dependency injection)
- FastAPI HTTP exception utilities

### Response Models
- `ProjectFileResponse` - Single file with metadata
- `ProjectFileListResponse` - Multiple files with list container
- `ProjectFileDeleteResponse` - Deletion confirmation

---

## Key Features

1. **Dual Source Support**: Handle both local uploads and GitHub imports
2. **Role-Based Access**: Admin, developer, viewer permissions with branch restrictions
3. **File Validation**: Extension checking based on project language
4. **Size Limits**: Enforce 10 MB maximum per file
5. **Smart Upsert**: Re-uploading same filename refreshes metadata
6. **Signed URLs**: Generate 1-hour expiring download links
7. **Storage Management**: Files stored with project-scoped paths
8. **Branch Tracking**: Record which GitHub branch file was imported from

---

## Summary

The project_files service module provides comprehensive file management:

1. **list_project_files()** - Retrieve project files with access control
2. **upload_project_file()** - Upload local files with validation
3. **import_github_file()** - Import from GitHub with role/branch restrictions
4. **delete_project_file()** - Remove files from storage and database

Plus 8 private helper functions for access control, validation, storage operations, and database management. Implements multi-layered security with project ownership, team membership, and branch-level access controls.
