# Backend App Services Projects Documentation

This document provides comprehensive information about the projects services defined in `backend/app/services/projects`. These services handle all project CRUD operations, bulk operations, and project visibility logic.

---

## Directory Structure

```
backend/app/services/projects/
├── __init__.py            # Package initialization
└── project_service.py     # Project CRUD and listing logic
```

---

## __init__.py

### Purpose
Package initialization file for the projects services module.

### Content
Marks the directory as a Python package enabling imports from this module.

### Use Case
Allows importing functions using:
```python
from app.services.projects import project_service
```

---

## project_service.py

### Purpose
Comprehensive project management service handling creation, retrieval, updates, deletion, and bulk operations. Manages project visibility and access control for personal and team projects.

### Imports
- `HTTPException, status` from `fastapi` - Error handling
- `Client` from `supabase` - Database client
- `List` from `typing` - Type hints
- Pydantic models from `app.models.projects` - Request/response schemas

### Private Helper Functions

#### require_owner(project_id, user_id, supabase)
- **Purpose**: Validates user is the project owner
- **Logic**:
  1. Query projects table for single record by project_id
  2. Return 404 if project not found
  3. Compare owner_id with user_id
  4. Return 403 if user is not owner
  5. Return full project row if authorized
- **Returns**: Full project row from database
- **Raises**: 
  - 404 NOT_FOUND - Project doesn't exist
  - 403 FORBIDDEN - User doesn't own project
- **Database Query**: SELECT * FROM projects WHERE id=?
- **Used For**: Delete, update, and file deletion operations (owner-only)
- **Error Messages**: 
  - "Project not found"
  - "You do not own this project"

---

## Public Service Functions

#### list_user_projects(user_id, supabase)
- **Purpose**: Fetch all projects visible to user (personal + team projects)
- **Logic Flow**:
  1. Query team_members table for all teams user is member of
  2. Extract team_ids from membership rows
  3. Build OR filter with two conditions:
     - owner_id = user_id (personal projects)
     - team_id IN (list of team IDs) (team projects)
  4. Execute combined query with .or_() operator
  5. Convert each row to ProjectResponse
  6. Return ProjectListResponse containing all projects
- **Filter Construction Example**:
  ```
  "owner_id.eq.user-123,team_id.in.(team-a,team-b,team-c)"
  ```
- **Returns**: `ProjectListResponse` with projects array
- **Error Handling**: Returns empty list if no projects found
- **Database Queries**: 
  1. SELECT team_id FROM team_members WHERE user_id = ?
  2. SELECT * FROM projects WHERE (owner_id = ? OR team_id IN (...))
- **Use Case**: Display all user's projects in dashboard
- **Performance Note**: Uses single OR query for efficiency

#### create_project(body, user_id, supabase)
- **Purpose**: Create new project with validation
- **Access Control for Team Projects**:
  - If type="team" and team_id provided:
    1. Verify user is member of team
    2. Verify user has "admin" role (not developer or viewer)
    3. Reject if developer or viewer tries to create
- **Flow**:
  1. Validate team_id provided if type="team" (422)
  2. For team projects: Check membership and admin role
  3. Build insert payload:
     - `name` (required)
     - `type` (required - "personal" or "team")
     - `owner_id` = user_id
     - `language` (optional, omitted if None)
     - `team_id` (optional, omitted if None)
  4. Insert into projects table
  5. Return newly created project as ProjectResponse
- **Payload Strategy**: Omits None values to avoid sending NULL into NOT NULL columns
- **Returns**: `ProjectResponse` with created project
- **Validation Errors**:
  - 422 - team_id missing for team type project
  - 422 - Project name empty/invalid
  - 403 - User not team member
  - 403 - User is not team admin (is developer/viewer)
- **Error Messages**:
  - "team_id is required for team projects"
  - "You are not a member of this team"
  - "Only team admins can create projects under a team. Your current role is '{role}'. Please ask a team admin to create the project..."
- **Database Operation**: INSERT INTO projects (...)
- **Use Case**: User creates new personal or team project

#### get_project_by_id(project_id, user_id, supabase)
- **Purpose**: Retrieve single project with visibility check
- **Access Control**:
  1. Check if user owns project → return project
  2. Check if team project and user is team member → return project
  3. Otherwise → 404 (don't leak existence)
- **Logic Flow**:
  1. Query project by ID
  2. Return 404 if not found
  3. Check if owner_id matches user_id
  4. If not owner and project has team_id:
     - Query team_members to check if user is member
     - Return project if member found
  5. Return 404 if not owner and not team member (security: hide existence)
- **Returns**: `ProjectResponse` if authorized
- **Raises**: 404 in all unauthorized cases (doesn't reveal whether project exists)
- **Database Queries**:
  1. SELECT * FROM projects WHERE id = ?
  2. SELECT team_id FROM team_members WHERE team_id=? AND user_id=?
- **Security Note**: Returns 404 for both "not found" and "not authorized" to prevent information leakage
- **Use Case**: Fetch project details for viewing/editing

#### update_project(project_id, body, user_id, supabase)
- **Purpose**: Partially update project properties
- **Access**: Owner only
- **Flow**:
  1. Verify ownership via `require_owner()`
  2. Build updates dict only with provided fields:
     - `name` if provided
     - `language` if provided
     - `health_score` if provided
     - `type` if provided
     - `team_id` if provided
  3. Verify at least one field provided (400 if none)
  4. Execute UPDATE query
  5. Return updated ProjectResponse
- **Partial Update Logic**: Only fields with non-None values included in update
- **Returns**: `ProjectResponse` with updated project
- **Validation Errors**:
  - 404 - Project not found
  - 403 - User not owner
  - 400 - No fields provided to update
- **Database Operation**: UPDATE projects SET ... WHERE id=?
- **Use Case**: Edit project properties (name, language, health score)
- **Note**: Type and team_id can be changed via update

#### delete_project(project_id, user_id, supabase)
- **Purpose**: Delete a project
- **Access**: Owner only
- **Flow**:
  1. Verify ownership via `require_owner()`
  2. Execute DELETE query
  3. Return None (endpoint returns 204 No Content)
- **Returns**: None
- **Error Handling**: 404 if not found, 403 if not owner
- **Database Operation**: DELETE FROM projects WHERE id=?
- **Cascade Behavior**: Foreign key constraints cascade delete:
  - Project files deleted
  - Project scans deleted
  - Associated records cleaned up
- **Use Case**: Remove project and all associated data

#### bulk_delete_projects(ids, user_id, supabase)
- **Purpose**: Delete multiple projects in single operation
- **Access**: Owner-only (filters to owned projects)
- **Logic Flow**:
  1. Query projects table:
     - SELECT id FROM projects
     - WHERE owner_id = user_id
     - AND id IN (provided IDs)
  2. Extract owned_ids from results
  3. If no owned projects in list → 422 error
  4. Delete all owned_ids in single query
  5. Return BulkDeleteResponse with count
- **Filtering Strategy**: 
  - Only deletes projects user actually owns
  - Prevents unauthorized deletion attempts
  - Silently ignores non-owned IDs instead of failing
- **Returns**: `BulkDeleteResponse` with deleted count
- **Validation Errors**:
  - 422 - No owned projects in provided IDs
- **Error Message**: "No owned projects found in the provided IDs"
- **Database Queries**:
  1. SELECT id FROM projects WHERE owner_id=? AND id IN (...)
  2. DELETE FROM projects WHERE id IN (...)
- **Use Case**: Clean up multiple projects from project list UI

---

## Database Tables Involved

### projects Table
**Columns**:
- `id` (UUID, PRIMARY KEY) - Unique project identifier
- `name` (TEXT, NOT NULL) - Project name
- `owner_id` (FK to users) - Project owner
- `type` (ENUM) - "personal" or "team"
- `team_id` (FK to teams, nullable) - Associated team (if team project)
- `language` (TEXT, nullable) - Programming language (C, C++, Python, etc.)
- `health_score` (INT, nullable) - Security health metric
- `created_at` (TIMESTAMP) - Project creation time
- `updated_at` (TIMESTAMP) - Last modification time

**Relationships**:
- Many projects per user
- Optional team association (team projects)
- One-to-many with project_files (cascade delete)
- One-to-many with scans (cascade delete)

### team_members Table (referenced)
**Columns queried**:
- `team_id` - Team ID
- `user_id` - Member user ID
- `role` - Member role (owner, admin, developer, viewer)

---

## Access Control Matrix

### Personal Projects
- **Owner**: Can CRUD, delete
- **Others**: Cannot access (404)

### Team Projects
- **Team Owner/Admin**: Can CRUD, delete
- **Team Developer**: Cannot create project, but can access files
- **Team Viewer**: Cannot create, cannot access files
- **Non-member**: Cannot access (404)

### Project Creation
- **Personal**: Any authenticated user
- **Team**: Only team admin members can create

### File Operations on Team Projects
- **Owner**: Can upload/import/delete
- **Team Admin**: Can upload/import, cannot delete
- **Team Developer**: Can upload/import, cannot delete
- **Team Viewer**: Cannot access files

---

## Integration Points

### Called By
- **Routers**: `backend/app/routers/projects.py`
  - `list_projects()` → `list_user_projects()`
  - `create_project()` → `create_project()`
  - `get_project()` → `get_project_by_id()`
  - `update_project()` → `update_project()`
  - `delete_project()` → `delete_project()`
  - `bulk_delete_projects()` → `bulk_delete_projects()`

### Dependencies
- Supabase Client (dependency injection)
- FastAPI HTTP exception utilities

### Response Models
- `ProjectResponse` - Single project
- `ProjectListResponse` - Multiple projects list
- `BulkDeleteResponse` - Bulk deletion result

---

## Key Features

1. **Personal & Team Projects**: Support for individual and collaborative projects
2. **Role-Based Access**: Different permissions for owner, admin, developer, viewer
3. **Visibility Control**: Hide non-accessible projects (404 instead of 403)
4. **Partial Updates**: Update only provided fields, leave others unchanged
5. **Bulk Operations**: Delete multiple projects efficiently
6. **Access Validation**: Multi-level checks for team/personal projects
7. **Cascade Deletes**: Associated files and scans removed with project
8. **Admin Enforcement**: Only team admins can create team projects

---

## Summary

The projects service module provides comprehensive project management:

1. **list_user_projects()** - Retrieve user's personal and team projects
2. **create_project()** - Create new project with team admin validation
3. **get_project_by_id()** - Fetch project with visibility checks
4. **update_project()** - Partially update project properties
5. **delete_project()** - Remove project and cascade delete related data
6. **bulk_delete_projects()** - Delete multiple owned projects

Plus 1 private helper function for ownership validation. Implements comprehensive access control for personal vs team projects with role-based permissions and security-conscious visibility rules.
