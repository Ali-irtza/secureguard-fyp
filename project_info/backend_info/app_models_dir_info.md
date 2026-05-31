# Backend App Models Directory Documentation

This document provides comprehensive information about all the Pydantic models and schemas defined in the `backend/app/models` folder. These models define the data structures for request/response validation and database interactions.

---

## auth.py

### Purpose
Defines Pydantic schemas for authentication and user profile management. These are request/response models used in auth endpoints.

### Imports
- `BaseModel` from `pydantic` - Base class for all Pydantic models with validation
- `Optional` from `typing` - Marks fields as optional
- `datetime` from `datetime` - For timestamp fields

### Classes & Schemas

#### ProfileUpdateRequest
- **Purpose**: Payload schema for POST /auth/profile endpoint. Allows partial profile updates.
- **Fields**:
  - `full_name: Optional[str]` - User's full name (optional, can be None)
  - `avatar_url: Optional[str]` - URL to user's avatar image (optional, can be None)
- **Use Case**: Frontend sends this when user updates their profile information

#### ProfileResponse
- **Purpose**: Response schema representing a user profile row from the profiles table in Supabase.
- **Fields**:
  - `id: str` - Unique user identifier
  - `full_name: Optional[str]` - User's full name (can be null in database)
  - `avatar_url: Optional[str]` - URL to user's avatar (can be null)
  - `created_at: Optional[datetime]` - Timestamp when profile was created
  - `updated_at: Optional[datetime]` - Timestamp when profile was last updated
- **Use Case**: Backend sends this when returning profile information from database

#### MeResponse
- **Purpose**: Response schema for GET /auth/me endpoint. Combines Supabase auth user data with profiles table data.
- **Fields**:
  - `id: str` - Unique user identifier from Supabase auth
  - `email: Optional[str]` - User's email address (optional)
  - `full_name: Optional[str]` - User's full name from profiles table
  - `avatar_url: Optional[str]` - User's avatar URL from profiles table
  - `created_at: Optional[datetime]` - Profile creation timestamp
- **Use Case**: Frontend calls GET /auth/me to get current authenticated user's complete profile data

---

## project_files.py

### Purpose
Defines Pydantic models for project files metadata and operations. These models represent uploaded/managed files within projects.

### Imports
- `BaseModel` from `pydantic` - Base class for validation
- `Optional` from `typing` - Optional field type
- `List` from `typing` - List type for array fields
- `datetime` from `datetime` - Timestamp fields

### Classes & Schemas

#### ProjectFile
- **Purpose**: Base model representing a project file entity stored in database.
- **Fields**:
  - `id: str` - Unique file identifier (UUID)
  - `project_id: str` - Foreign key reference to parent project
  - `file_name: str` - Original filename with extension
  - `file_size: int` - File size in bytes
  - `file_type: str` - MIME type (e.g., "application/pdf", "image/png")
  - `file_path: str` - Storage path in backend/database
  - `uploaded_by: str` - User ID who uploaded the file
  - `uploaded_at: datetime` - Timestamp of upload
  - `updated_at: Optional[datetime]` - Last modification timestamp
- **Use Case**: Database representation and API response for file metadata

#### ProjectFileCreate
- **Purpose**: Request schema for uploading/creating a new project file.
- **Fields**:
  - `project_id: str` - Which project this file belongs to
  - `file_name: str` - Name of the file being uploaded
  - `file_type: str` - MIME type of the file
  - `file_size: int` - Size of file in bytes
- **Use Case**: Frontend sends this when uploading a file to a project

#### ProjectFileUpdate
- **Purpose**: Request schema for updating project file metadata.
- **Fields**:
  - `file_name: Optional[str]` - Can rename the file
  - `file_type: Optional[str]` - Can update file type
- **Use Case**: Frontend sends this for file rename/metadata updates

#### ProjectFileResponse
- **Purpose**: Response schema returned to frontend when file operations complete.
- **Fields**:
  - `id: str` - File ID
  - `project_id: str` - Parent project ID
  - `file_name: str` - Current filename
  - `file_size: int` - Size in bytes
  - `file_type: str` - MIME type
  - `uploaded_by: str` - Uploader's user ID
  - `uploaded_at: datetime` - Upload time
  - `updated_at: Optional[datetime]` - Last update time
- **Use Case**: API response when fetching file details or after upload

#### ProjectFileList
- **Purpose**: Container for multiple project file responses with pagination support.
- **Fields**:
  - `files: List[ProjectFileResponse]` - Array of file objects
  - `total: int` - Total number of files in project
  - `page: int` - Current page number
  - `page_size: int` - Number of files per page
- **Use Case**: Response when listing all files in a project with pagination

---

## projects.py

### Purpose
Defines Pydantic models for project management. These models represent projects, their creation/updates, and listing operations.

### Imports
- `BaseModel` from `pydantic` - Base class for validation
- `Optional` from `typing` - Optional fields
- `List` from `typing` - List fields
- `datetime` from `datetime` - Timestamps
- `Enum` from `enum` - Enumeration type for status values

### Classes & Schemas

#### ProjectStatus (Enum)
- **Purpose**: Enumeration of possible project statuses.
- **Values**:
  - `ACTIVE` - Project is actively being worked on
  - `COMPLETED` - Project work is finished
  - `ARCHIVED` - Project is archived/inactive
  - `PAUSED` - Project is temporarily paused
- **Use Case**: Ensures only valid status values are used throughout application

#### Project
- **Purpose**: Core project entity model representing a project in database.
- **Fields**:
  - `id: str` - Unique project identifier (UUID)
  - `owner_id: str` - User ID of project owner
  - `project_name: str` - Name of the project
  - `description: Optional[str]` - Project description (optional)
  - `status: ProjectStatus` - Current status (ACTIVE, COMPLETED, etc.)
  - `created_at: datetime` - When project was created
  - `updated_at: datetime` - Last modification time
  - `team_id: Optional[str]` - Associated team ID (if part of team project)
- **Use Case**: Database representation of a project record

#### ProjectCreate
- **Purpose**: Request schema for creating a new project.
- **Fields**:
  - `project_name: str` - Required project name
  - `description: Optional[str]` - Optional description
  - `team_id: Optional[str]` - Optional team association
- **Use Case**: Frontend sends this when creating a new project

#### ProjectUpdate
- **Purpose**: Request schema for updating project properties.
- **Fields**:
  - `project_name: Optional[str]` - Can update project name
  - `description: Optional[str]` - Can update description
  - `status: Optional[ProjectStatus]` - Can change status
- **Use Case**: Frontend sends this for project edits

#### ProjectResponse
- **Purpose**: Response schema returned when fetching a single project.
- **Fields**:
  - `id: str` - Project ID
  - `owner_id: str` - Owner's user ID
  - `project_name: str` - Project name
  - `description: Optional[str]` - Project description
  - `status: ProjectStatus` - Current status
  - `created_at: datetime` - Creation timestamp
  - `updated_at: datetime` - Last update timestamp
  - `team_id: Optional[str]` - Team association
- **Use Case**: API response when fetching project details

#### ProjectListResponse
- **Purpose**: Container for multiple project responses with pagination.
- **Fields**:
  - `projects: List[ProjectResponse]` - Array of project objects
  - `total: int` - Total projects (for user or team)
  - `page: int` - Current page number
  - `page_size: int` - Number of projects per page
- **Use Case**: Response when listing user's or team's projects

#### ProjectDetail
- **Purpose**: Extended project response including related data (files, scans, team members).
- **Fields**:
  - `id: str` - Project ID
  - `owner_id: str` - Owner's user ID
  - `project_name: str` - Project name
  - `description: Optional[str]` - Description
  - `status: ProjectStatus` - Current status
  - `created_at: datetime` - Creation time
  - `updated_at: datetime` - Update time
  - `team_id: Optional[str]` - Team ID
  - `files: List[ProjectFileResponse]` - All project files
  - `scans: List[ScanResponse]` - All project scans
  - `team_members: List[str]` - Team member IDs (if team project)
- **Use Case**: API response when fetching full project details with all related data

---

## scans.py

### Purpose
Defines Pydantic models for security scans. These models represent scan operations, results, and vulnerability findings.

### Imports
- `BaseModel` from `pydantic` - Base class
- `Optional` from `typing` - Optional fields
- `List` from `typing` - List fields
- `datetime` from `datetime` - Timestamps
- `Enum` from `enum` - Enumerations for scan/vulnerability status

### Classes & Schemas

#### ScanStatus (Enum)
- **Purpose**: Enumeration of scan execution statuses.
- **Values**:
  - `PENDING` - Scan queued but not started
  - `RUNNING` - Scan currently in progress
  - `COMPLETED` - Scan finished successfully
  - `FAILED` - Scan encountered an error
  - `CANCELLED` - Scan was cancelled by user
- **Use Case**: Track scan execution state throughout its lifecycle

#### VulnerabilitySeverity (Enum)
- **Purpose**: Enumeration of vulnerability risk levels.
- **Values**:
  - `CRITICAL` - Immediate security risk
  - `HIGH` - Significant security concern
  - `MEDIUM` - Moderate security issue
  - `LOW` - Minor security concern
  - `INFO` - Informational finding
- **Use Case**: Categorize discovered vulnerabilities by severity

#### Vulnerability
- **Purpose**: Individual vulnerability finding discovered during a scan.
- **Fields**:
  - `id: str` - Unique vulnerability ID
  - `scan_id: str` - Reference to parent scan
  - `vulnerability_type: str` - Type (e.g., "SQL Injection", "XSS", "CSRF")
  - `severity: VulnerabilitySeverity` - Risk level
  - `description: str` - Detailed description of vulnerability
  - `file_name: Optional[str]` - File where vulnerability was found
  - `line_number: Optional[int]` - Code line number of issue
  - `remediation: str` - Suggested fix/remediation steps
  - `created_at: datetime` - When vulnerability was discovered
- **Use Case**: Database record and API response for individual findings

#### Scan
- **Purpose**: Core scan entity representing a security scan operation.
- **Fields**:
  - `id: str` - Unique scan ID
  - `project_id: str` - Parent project
  - `scan_type: str` - Type of scan (e.g., "static", "dependency", "container")
  - `status: ScanStatus` - Current scan status
  - `started_at: datetime` - When scan began
  - `completed_at: Optional[datetime]` - When scan finished (null if still running)
  - `total_vulnerabilities: int` - Total findings in scan
  - `critical_count: int` - Number of critical severity findings
  - `high_count: int` - Number of high severity findings
  - `medium_count: int` - Number of medium severity findings
  - `low_count: int` - Number of low severity findings
- **Use Case**: Database representation of a scan record

#### ScanCreate
- **Purpose**: Request schema for initiating a new security scan.
- **Fields**:
  - `project_id: str` - Which project to scan
  - `scan_type: str` - Type of scan to perform
  - `target_file_id: Optional[str]` - Specific file to scan (optional)
- **Use Case**: Frontend sends this when starting a scan

#### ScanResponse
- **Purpose**: Response schema when returning scan data.
- **Fields**:
  - `id: str` - Scan ID
  - `project_id: str` - Parent project
  - `scan_type: str` - Type of scan
  - `status: ScanStatus` - Current status
  - `started_at: datetime` - Start time
  - `completed_at: Optional[datetime]` - End time
  - `total_vulnerabilities: int` - Total findings
  - `critical_count: int` - Critical vulnerabilities
  - `high_count: int` - High severity
  - `medium_count: int` - Medium severity
  - `low_count: int` - Low severity
- **Use Case**: API response for scan summaries/listings

#### ScanDetailResponse
- **Purpose**: Extended scan response including all discovered vulnerabilities.
- **Fields**:
  - `id: str` - Scan ID
  - `project_id: str` - Parent project
  - `scan_type: str` - Scan type
  - `status: ScanStatus` - Status
  - `started_at: datetime` - Start time
  - `completed_at: Optional[datetime]` - End time
  - `total_vulnerabilities: int` - Total count
  - `critical_count: int`, `high_count: int`, `medium_count: int`, `low_count: int` - Counts by severity
  - `vulnerabilities: List[Vulnerability]` - Full list of all findings
- **Use Case**: API response when fetching full scan details with all vulnerabilities

---

## teams.py

### Purpose
Defines Pydantic models for team management. These models handle team creation, membership, roles, and team-related operations.

### Imports
- `BaseModel` from `pydantic` - Base validation class
- `Optional` from `typing` - Optional fields
- `List` from `typing` - List fields
- `datetime` from `datetime` - Timestamps
- `Enum` from `enum` - Enumerations for roles

### Classes & Schemas

#### MemberRole (Enum)
- **Purpose**: Enumeration of team member roles with different permissions.
- **Values**:
  - `OWNER` - Full control over team and all projects
  - `ADMIN` - Administrative access, can manage members
  - `MEMBER` - Regular team member with project access
  - `VIEWER` - Read-only access to team projects
- **Use Case**: Control what actions different team members can perform

#### TeamMember
- **Purpose**: Represents an individual member in a team.
- **Fields**:
  - `id: str` - Unique team member record ID
  - `team_id: str` - Parent team ID
  - `user_id: str` - User's ID in system
  - `role: MemberRole` - Member's role (OWNER, ADMIN, MEMBER, VIEWER)
  - `email: Optional[str]` - Member's email address
  - `full_name: Optional[str]` - Member's full name
  - `joined_at: datetime` - When member joined team
  - `updated_at: Optional[datetime]` - Last modification time
- **Use Case**: Database record and API response for team membership

#### Team
- **Purpose**: Core team entity representing an organization/team.
- **Fields**:
  - `id: str` - Unique team ID (UUID)
  - `team_name: str` - Display name of team
  - `owner_id: str` - User ID of team owner
  - `description: Optional[str]` - Team description
  - `created_at: datetime` - When team was created
  - `updated_at: datetime` - Last modification
- **Use Case**: Database representation of a team

#### TeamCreate
- **Purpose**: Request schema for creating a new team.
- **Fields**:
  - `team_name: str` - Required team name
  - `description: Optional[str]` - Optional team description
- **Use Case**: Frontend sends this when creating a team

#### TeamUpdate
- **Purpose**: Request schema for updating team properties.
- **Fields**:
  - `team_name: Optional[str]` - Can update team name
  - `description: Optional[str]` - Can update description
- **Use Case**: Frontend sends this for team edits

#### TeamResponse
- **Purpose**: Response schema when returning team data.
- **Fields**:
  - `id: str` - Team ID
  - `team_name: str` - Team name
  - `owner_id: str` - Owner's user ID
  - `description: Optional[str]` - Description
  - `created_at: datetime` - Creation time
  - `updated_at: datetime` - Last update time
- **Use Case**: API response when fetching team details

#### AddTeamMemberRequest
- **Purpose**: Request schema for adding a new member to team.
- **Fields**:
  - `email: str` - Email of user to add (user must exist in system)
  - `role: MemberRole` - Role to assign (MEMBER, VIEWER, ADMIN)
- **Use Case**: Team owner/admin sends this to invite member

#### RemoveTeamMemberRequest
- **Purpose**: Request schema for removing a member from team.
- **Fields**:
  - `user_id: str` - ID of user to remove
- **Use Case**: Team owner/admin sends this to remove member

#### UpdateTeamMemberRoleRequest
- **Purpose**: Request schema for changing a member's role.
- **Fields**:
  - `user_id: str` - ID of member to update
  - `role: MemberRole` - New role to assign
- **Use Case**: Team owner changes member permissions/role

#### TeamMemberResponse
- **Purpose**: Response schema when returning member information.
- **Fields**:
  - `id: str` - Team member record ID
  - `team_id: str` - Team ID
  - `user_id: str` - User ID
  - `role: MemberRole` - Current role
  - `email: Optional[str]` - User's email
  - `full_name: Optional[str]` - User's name
  - `joined_at: datetime` - Join timestamp
  - `updated_at: Optional[datetime]` - Last update time
- **Use Case**: API response when listing team members or member details

#### TeamDetailResponse
- **Purpose**: Extended team response including all members.
- **Fields**:
  - `id: str` - Team ID
  - `team_name: str` - Team name
  - `owner_id: str` - Owner's ID
  - `description: Optional[str]` - Description
  - `created_at: datetime` - Creation time
  - `updated_at: datetime` - Update time
  - `members: List[TeamMemberResponse]` - All team members with roles
- **Use Case**: API response when fetching complete team details including all members

#### TeamListResponse
- **Purpose**: Container for multiple team responses with pagination.
- **Fields**:
  - `teams: List[TeamResponse]` - Array of team objects
  - `total: int` - Total teams for user
  - `page: int` - Current page
  - `page_size: int` - Items per page
- **Use Case**: Response when listing user's teams with pagination

---

## Summary

The models directory contains 5 core files defining Pydantic schemas:

1. **auth.py**: User authentication and profile schemas
2. **project_files.py**: File upload and file metadata schemas
3. **projects.py**: Project CRUD operations and project detail schemas
4. **scans.py**: Security scan and vulnerability finding schemas
5. **teams.py**: Team management and member role schemas

These models provide:
- Type validation using Pydantic (prevents invalid data)
- Request/response schemas for FastAPI endpoints
- Database entity representations
- Type hints for IDE autocomplete
- Automatic OpenAPI documentation generation
