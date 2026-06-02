# backend/app/services/teams Documentation

## Overview
The teams services directory manages team creation, member management, GitHub repository integration, and branch-based file access control. It includes OAuth-based GitHub App authentication and role-based permission enforcement across admin, developer, and viewer tiers.

---

## File: __init__.py

### Purpose
Package initialization file for the teams services module. Currently minimal, serves as a marker for the Python package.

### Content
- Single comment: "# Teams services package"
- No functions, classes, or utilities exported

---

## File: team_service.py

### Purpose
Core team management service providing functions to create, retrieve, list, update, and delete teams. Also handles member role enforcement and team member bulk fetching with optimized database queries.

### Imports
```
from fastapi import HTTPException, status
from supabase import Client
from app.models.teams import (
    TeamResponse,
    TeamListResponse,
    TeamMemberResponse,
    MemberProfile,
    TeamRole,
)
```

### Key Functions

#### 1. require_admin(team_id: str, user_id: str, supabase: Client) → None
**Purpose**: Access control validator that raises 403 Forbidden if the user is not a team admin.

**Logic Flow**:
- Queries team_members table filtering by team_id and user_id
- Uses .single() to fetch exactly one row
- Checks if result.data exists AND role equals "admin"
- If not admin, raises HTTPException with 403 status and message "Only team admins can perform this action"

**Use Case**: Protected routes that require admin privileges (adding members, changing team settings, deleting teams)

---

#### 2. require_member(team_id: str, user_id: str, supabase: Client) → dict
**Purpose**: Access control validator that raises 403 Forbidden if the user is not a team member; returns member record if valid.

**Logic Flow**:
- Queries team_members table for the user in the specified team
- Uses .single() to fetch exactly one row
- Returns full member record if found
- Raises 403 Forbidden with message "You are not a member of this team" if not found

**Returns**: Member dict containing team_id, user_id, role, branches, created_at, and other team_members table columns

**Use Case**: Routes requiring team membership (viewing team details, accessing team files)

---

#### 3. build_team_response(team: dict, members: list, current_user_id: str) → TeamResponse
**Purpose**: Assembles a complete TeamResponse object from raw database rows, including member profiles and current user's role.

**Logic Flow**:
- Iterates through members list to find current user's role (defaults to TeamRole.viewer if not found)
- Constructs list of TeamMemberResponse objects by mapping each member dict to the response schema
- For each member, extracts profile data (full_name, avatar_url) from nested profiles dict
- Builds final TeamResponse with:
  - Team metadata (id, name, github_repo, github_branches, created_by, created_at, updated_at)
  - current_user_role: The requesting user's role in this team
  - member_count: Total number of members
  - members: Array of TeamMemberResponse objects with full profile data

**Use Case**: Used by all team retrieval operations (get_team_by_id, list_user_teams, create_new_team, update operations)

---

#### 4. fetch_members_for_team(team_id: str, supabase: Client) → list
**Purpose**: Fetches all members for a single team and enriches them with profile data from profiles table.

**Logic Flow**:
- Queries team_members table for all rows matching team_id
- If no members found, returns empty list
- Extracts unique user_ids from all member records
- Batch-fetches all profiles for those user_ids in one query (columns: id, full_name, avatar_url)
- Maps profiles into a dict keyed by user_id
- Attaches each user's profile to their team_member row under "profiles" key
- Returns enriched members list

**Optimization**: Used for single-team operations. Performs 2 database queries total (team_members + profiles batch)

**Returns**: List of member dicts with attached profile data under m["profiles"]

---

#### 5. fetch_members_for_teams(team_ids: list[str], supabase: Client) → dict[str, list]
**Purpose**: Batch-fetches members for multiple teams in exactly 2 database round trips. Replaces previous N×2 sequential queries in list_user_teams.

**Logic Flow**:
- If team_ids is empty, returns empty dict
- Query 1: Fetches ALL team_members rows matching any of the team_ids in one query (.in_("team_id", team_ids))
- Extract unique set of user_ids from all fetched members
- Query 2: Batch-fetches all profiles for all unique user_ids in one query (.in_("id", user_ids))
- Maps profiles into dict keyed by user_id
- Attaches each profile to member rows
- Groups all members by team_id
- Returns dict: {team_id: [member1, member2, ...], ...}

**Performance**: O(2) database queries regardless of number of teams (major optimization vs O(N×2))

**Returns**: Dict mapping each team_id to its enriched members list

---

#### 6. list_user_teams(user_id: str, supabase: Client) → TeamListResponse
**Purpose**: Returns all teams the user belongs to, with full member and profile data for each team.

**Query Plan** (optimized to 3 total queries):
1. Query team_members for all rows where user_id matches → get team_ids
2. Query teams table for all those team_ids in one batch query → get team data
3. Batch fetch members for all teams using fetch_members_for_teams() (2 more queries: team_members batch + profiles batch)

**Logic Flow**:
- Queries team_members for current user to get list of team_ids they belong to
- If user has no teams, returns TeamListResponse(teams=[])
- Batch-fetches all team records for those team_ids
- Calls fetch_members_for_teams() to get all members+profiles for all teams in 2 queries
- Maps each team to TeamResponse using build_team_response()
- Returns TeamListResponse containing all teams

**Use Case**: Called when user loads their dashboard to see all teams they're a member of

---

#### 7. create_new_team(name: str, user_id: str, supabase: Client) → TeamResponse
**Purpose**: Creates a new team with the given name and makes the creator an admin.

**Logic Flow**:
- Inserts new row into teams table with name and created_by = user_id
- Extracts created team record (auto-generates id, created_at, updated_at via Supabase)
- Inserts new row into team_members with team_id, user_id, role="admin"
- Fetches all members for the new team using fetch_members_for_team()
- Returns fully populated TeamResponse

**Use Case**: POST /teams endpoint to create a new team

---

#### 8. get_team_by_id(team_id: str, user_id: str, supabase: Client) → TeamResponse
**Purpose**: Retrieves a single team by ID if the user is a member.

**Logic Flow**:
- Calls require_member() to verify access (raises 403 if not a member)
- Queries teams table for the team_id
- Fetches all members for the team
- Returns fully populated TeamResponse

**Use Case**: GET /teams/{team_id} endpoint

---

#### 9. update_team_details(team_id: str, user_id: str, name: str | None, github_repo: str | None, supabase: Client) → TeamResponse
**Purpose**: Partial update for team name and/or GitHub repository URL.

**Logic Flow**:
- Calls require_admin() to verify admin access
- Builds updates dict with only non-None fields (name, github_repo)
- If no fields provided, raises 400 Bad Request
- Updates teams table row matching team_id with the updates dict
- Fetches all members and returns updated TeamResponse

**Use Case**: PATCH /teams/{team_id} endpoint

---

#### 10. delete_team_by_id(team_id: str, user_id: str, supabase: Client) → None
**Purpose**: Permanently deletes a team (admin only). Cascade deletes team_members and projects via Supabase foreign key constraints.

**Logic Flow**:
- Calls require_admin() to verify admin access
- Deletes row from teams table matching team_id
- Supabase automatically cascades delete to related team_members, projects, and project_files rows

**Use Case**: DELETE /teams/{team_id} endpoint

---

========================================================

## File: member_service.py

### Purpose
Member management service handling team member invitations, role updates, and membership removal. Enforces admin-only access for member operations.

### Imports
```
from fastapi import HTTPException, status
from supabase import Client
from app.models.teams import (
    TeamMemberResponse,
    MemberProfile,
    TeamRole,
)
from app.services.teams.team_service import require_admin
```

### Key Functions

#### 1. invite_user_to_team(team_id: str, email: str, role: str, current_user_id: str, supabase: Client) → TeamMemberResponse
**Purpose**: Adds a user to the team by their email address. Only team admins can invite users.

**Logic Flow**:
- Calls require_admin() to verify admin access
- Queries Supabase auth.admin.list_users() to get all system users
- Finds user with matching email (case-insensitive comparison)
- If no user found, raises 404 Not Found with message "No account found with that email address"
- If email matches current_user_id, raises 400 Bad Request: "You are already a member of this team"
- Checks if user is already a team member by querying team_members table
- If already a member, raises 409 Conflict: "This user is already a member of the team"
- Inserts new row into team_members with team_id, user_id (from found user), and role
- Fetches the invited user's profile from profiles table (full_name, avatar_url)
- Returns TeamMemberResponse with newly added member's details

**Use Case**: POST /teams/{team_id}/members endpoint to invite a user by email

---

#### 2. update_team_member(team_id: str, member_user_id: str, role: str | None, branches: list[str] | None, current_user_id: str, supabase: Client) → TeamMemberResponse
**Purpose**: Updates a team member's role and/or branch assignments (admin only).

**Logic Flow**:
- Calls require_admin() to verify admin access
- Builds updates dict with only non-None fields (role, branches)
- Prevents admins from demoting themselves: if member_user_id == current_user_id and new role != "admin", raises 400 Bad Request
- If no fields to update, raises 400 Bad Request: "No fields to update"
- Updates team_members row matching (team_id, user_id) with updates dict
- If no row updated, raises 404 Not Found: "Member not found"
- Fetches updated member record
- Fetches member's profile from profiles table
- Returns updated TeamMemberResponse

**Use Case**: PATCH /teams/{team_id}/members/{member_user_id} endpoint to change role or branch access

---

#### 3. remove_team_member(team_id: str, member_user_id: str, current_user_id: str, supabase: Client) → None
**Purpose**: Removes a member from the team (admin only). Prevents self-removal.

**Logic Flow**:
- Calls require_admin() to verify admin access
- Prevents self-removal: if member_user_id == current_user_id, raises 400 Bad Request: "Admins cannot remove themselves from the team"
- Deletes row from team_members table matching team_id and user_id

**Use Case**: DELETE /teams/{team_id}/members/{member_user_id} endpoint

---

========================================================

## File: github_service.py

### Purpose
GitHub integration service handling OAuth authentication, repository connection, branch management, and branch file browsing using GitHub App installation tokens and PAT (Personal Access Token) fallback.

### Imports
```
import httpx
import time
import jwt
import secrets
from pathlib import Path
from fastapi import HTTPException, status
from fastapi.responses import RedirectResponse
from supabase import Client

from app.config import settings
from app.models.teams import TeamResponse, GithubAuthorizeResponse, BranchFileItem, BranchFilesResponse, FileContentResponse
from app.services.teams.team_service import require_admin, require_member, fetch_members_for_team, build_team_response
```

### Constants
```
GITHUB_API = "https://api.github.com"
FRONTEND_TEAM_URL = "http://localhost:8080/team"
GITHUB_APP_SLUG = "secureguard-pro"
```

### Private Helper Functions

#### 1. _load_private_key() → str
**Purpose**: Loads the GitHub App private key from filesystem.

**Logic Flow**:
- Constructs Path from settings.github_private_key_path
- Checks if file exists; raises 503 Service Unavailable if not found
- Reads and returns file content as string

**Error Handling**: 503 if key file not found

---

#### 2. _make_github_app_jwt() → str
**Purpose**: Generates a signed JWT token for GitHub App authentication.

**Logic Flow**:
- Gets current Unix timestamp
- Creates JWT payload with:
  - "iat" (issued at): now - 60 seconds (allows for clock skew)
  - "exp" (expiration): now + 480 seconds (8 minutes)
  - "iss" (issuer): settings.github_app_id
- Loads private key using _load_private_key()
- Encodes JWT using RS256 algorithm with private key
- Returns JWT token string

**Token Lifetime**: 8 minutes, which is GitHub's requirement for App JWT tokens

---

#### 3. _get_installation_token(installation_id: int) → str (async)
**Purpose**: Exchanges a GitHub App JWT for an installation access token (valid for 1 hour).

**Logic Flow**:
- Generates app JWT using _make_github_app_jwt()
- Makes async POST request to GitHub API endpoint: /app/installations/{installation_id}/access_tokens
- Sets headers with Bearer token, Accept for JSON, and GitHub API version
- Expects 201 Created response status
- Raises 502 Bad Gateway if status != 201
- Extracts and returns "token" field from response JSON

**Use Case**: Called before any GitHub API operation to get a valid installation-scoped token

---

#### 4. _parse_github_owner_repo(repo_url: str) → tuple[str, str]
**Purpose**: Parses GitHub repository URL to extract owner and repository name.

**Logic Flow**:
- Strips trailing slashes and removes ".git" suffix
- Splits on "github.com/"
- Validates format (must have exactly 2 parts)
- Splits owner/repo segment on "/" to get owner and repo
- Validates at least 2 segments exist
- Returns tuple (owner, repo)

**Error Handling**: Raises 400 Bad Request if URL format invalid

---

#### 5. _check_branch_access(team_id: str, user_id: str, branch: str, supabase: Client) → None
**Purpose**: Enforces branch-level access control based on user role and branch assignments.

**Logic Flow**:
- Calls require_member() to verify team membership and get member record
- Gets user's role from member record
- If role == "viewer": raises 403 Forbidden with message "Viewers do not have access to branch files"
- If role == "developer":
  - Gets assigned_branches from member record
  - If no branches assigned: raises 403 with message "No branches assigned. Ask your team admin to assign branches."
  - If requested branch not in assigned_branches: raises 403 with message showing allowed branches
- If role == "admin": allows access to any branch (no checks)

**Access Matrix**:
| Role | All Branches | Assigned Branches | Result |
|------|--------------|-------------------|--------|
| admin | N/A | N/A | ✓ Allowed |
| developer | No | Must match | ✓ or ✗ based on match |
| viewer | No | No | ✗ Forbidden |

---

#### 6. _get_repo_full_name(team_id: str, supabase: Client) → tuple[str, int]
**Purpose**: Retrieves (owner/repo, installation_id) for a team's connected GitHub repository.

**Logic Flow**:
- Queries teams table for github_repo and github_installation_id matching team_id
- Validates repo exists and has github_repo URL
- Validates installation_id exists
- Parses github_repo URL to extract owner/repo
- Returns tuple (owner/repo, installation_id)

**Error Handling**: Raises 400 Bad Request if repo not connected or URL invalid

---

### Public API Functions

#### 1. connect_github_repo(team_id: str, repo_url: str, pat: str, user_id: str, supabase: Client) → TeamResponse (async)
**Purpose**: Connects a GitHub repository to a team using a Personal Access Token, fetches all branches, and stores them.

**Logic Flow**:
- Calls require_admin() to verify admin access
- Parses repo_url using _parse_github_owner_repo() to get (owner, repo)
- Creates headers with Bearer PAT authentication
- Makes async GET request to /repos/{owner}/{repo} to validate repo access
- Validates response status: 401 for invalid token, 403 for insufficient scopes, 404 for repo not found
- Paginates through /repos/{owner}/{repo}/branches endpoint (100 per page) to collect all branches
- Updates teams table with github_repo URL and github_branches array
- Fetches all team members and returns updated TeamResponse

**Error Handling**:
- 401 Unauthorized: "Invalid Personal Access Token."
- 403 Forbidden: "Access denied. Check PAT scopes."
- 404 Not Found: "Repository not found."
- 502 Bad Gateway: GitHub API error

**Use Case**: Initial GitHub repo connection via PAT when GitHub App is not installed

---

#### 2. sync_branches(team_id: str, user_id: str, supabase: Client) → TeamResponse (async)
**Purpose**: Re-fetches the branch list for a team's connected repository using GitHub App installation token (no PAT required).

**Logic Flow**:
- Calls require_admin() to verify admin access
- Gets repo_full_name and installation_id using _get_repo_full_name()
- Gets installation token using _get_installation_token()
- Paginates through /repos/{repo_full_name}/branches (100 per page)
- Updates teams table with new github_branches array
- Returns updated TeamResponse

**Use Case**: Background task to periodically refresh branch list after new branches are created

---

#### 3. process_github_callback(installation_id: int | None, state: str | None, supabase: Client) → RedirectResponse (async)
**Purpose**: Handles OAuth callback from GitHub App installation flow, validates CSRF token, and stores installation ID.

**Logic Flow**:
- Validates installation_id and state parameters present
- Splits state on ":" to extract team_id and csrf_token
- Queries teams table for github_oauth_token field matching team_id
- Validates stored token matches format "pending:{csrf_token}" (CSRF protection)
- If CSRF mismatch detected, redirects to error page
- Updates teams table with github_installation_id and clears github_oauth_token to NULL
- Redirects to frontend team page with github_connected=true and team_id

**CSRF Protection**: Uses temporary token stored during authorize URL generation to prevent replay attacks

---

#### 4. generate_github_authorize_url(team_id: str, user_id: str, supabase: Client) → GithubAuthorizeResponse
**Purpose**: Generates GitHub App installation authorization URL for the frontend to redirect to.

**Logic Flow**:
- Validates GitHub App is configured (github_app_id and github_client_id in settings)
- Calls require_admin() to verify admin access
- Generates secure random CSRF token (32 bytes URL-safe)
- Creates state parameter as "team_id:csrf_token"
- Stores "pending:{csrf_token}" in teams.github_oauth_token (temporary staging)
- Constructs authorization URL: https://github.com/apps/{GITHUB_APP_SLUG}/installations/new?state={state}
- Returns GithubAuthorizeResponse with authorization_url

**CSRF Protection**: Uses random token to prevent CSRF attacks during OAuth flow

---

#### 5. fetch_installation_repos(team_id: str, user_id: str, supabase: Client) → dict (async)
**Purpose**: Lists all repositories the GitHub App is installed for this team.

**Logic Flow**:
- Calls require_admin() to verify admin access
- Queries teams table for github_installation_id
- Validates installation_id exists; raises 400 if not installed
- Gets installation token using _get_installation_token()
- Paginates through /installation/repositories endpoint (100 per page)
- For each repo, extracts: full_name, private flag, html_url
- Returns dict: {"repos": [{full_name, private, url}, ...]}

**Use Case**: Dropdown for admin to select which repo to connect to the team

---

#### 6. select_installation_repo(team_id: str, repo_full_name: str, repo_url: str, user_id: str, supabase: Client) → TeamResponse (async)
**Purpose**: Selects and connects a repository from the installation's available repos, fetches all branches.

**Logic Flow**:
- Calls require_admin() to verify admin access
- Validates repo_full_name is provided (not empty)
- Gets installation_id from teams table
- Validates installation exists
- Gets installation token using _get_installation_token()
- Paginates through /repos/{repo_full_name}/branches (100 per page) to fetch all branches
- Updates teams table with github_repo and github_branches
- Returns updated TeamResponse

**Use Case**: After listing repos, admin selects one and this connects it

---

#### 7. fetch_branch_files(team_id: str, branch: str, user_id: str, supabase: Client) → BranchFilesResponse (async)
**Purpose**: Fetches the complete recursive file tree for a specific branch.

**Logic Flow**:
- Calls _check_branch_access() to verify user's branch access (role + assignment checks)
- Gets repo_full_name and installation_id using _get_repo_full_name()
- Gets installation token using _get_installation_token()
- Makes GET request to /repos/{repo_full_name}/git/trees/{branch} with recursive=1 parameter
- Validates response status: 404 if branch not found, 502 for other GitHub errors
- Extracts tree array from response
- Converts each tree item to BranchFileItem with path, type (file/directory), and size
- Returns BranchFilesResponse with branch name and files array

**Response Structure**:
```json
{
  "branch": "main",
  "files": [
    {"path": "src/main.py", "type": "file", "size": 1024},
    {"path": "src/utils", "type": "directory", "size": null},
    ...
  ]
}
```

**Use Case**: Frontend loads file browser for a branch

---

#### 8. fetch_file_content(team_id: str, branch: str, file_path: str, user_id: str, supabase: Client) → FileContentResponse (async)
**Purpose**: Fetches the actual content of a single file from a branch, with UTF-8 decoding.

**Logic Flow**:
- Calls _check_branch_access() to verify user's branch access
- Gets repo_full_name and installation_id using _get_repo_full_name()
- Gets installation token using _get_installation_token()
- Makes GET request to /repos/{repo_full_name}/contents/{file_path} with ref=branch parameter
- Validates response status: 404 if file not found
- GitHub returns content as base64-encoded string in response JSON
- Decodes base64 content to UTF-8 string
- On decode failure, returns "[Binary file — cannot display]"
- Returns FileContentResponse with branch, path, decoded content, size, and encoding

**Error Handling**: Binary files return display message rather than attempting decode

**Use Case**: Frontend requests file content for code display/editing

---

## Role-Based Access Control Matrix

| Operation | Admin | Developer | Viewer |
|-----------|-------|-----------|--------|
| Create team | N/A | N/A | N/A |
| View team | ✓ | ✓ | ✓ |
| Update team | ✓ | ✗ | ✗ |
| Delete team | ✓ | ✗ | ✗ |
| Invite members | ✓ | ✗ | ✗ |
| Update member role | ✓ | ✗ | ✗ |
| Remove member | ✓ | ✗ | ✗ |
| Connect GitHub repo | ✓ | ✗ | ✗ |
| Browse all branches | ✓ | ✗ (restricted) | ✗ |
| Browse assigned branches | ✓ (any) | ✓ (assigned only) | ✗ |
| View file content | ✓ (any branch) | ✓ (assigned only) | ✗ |

---

## GitHub Integration Flow

### OAuth App Installation (GitHub App)
1. Admin clicks "Connect with GitHub"
2. Frontend calls `generate_github_authorize_url()` → returns auth URL with CSRF token
3. Frontend redirects to GitHub App installation page
4. User approves app installation
5. GitHub redirects to callback URL with installation_id and state
6. Backend calls `process_github_callback()` → validates CSRF, stores installation_id
7. Frontend sees github_connected=true and shows repo selection

### Repository Selection
1. Admin clicks "Select Repository"
2. Frontend calls `fetch_installation_repos()` → lists all repos the app is installed for
3. Admin selects a repo from dropdown
4. Frontend calls `select_installation_repo()` → fetches branches, updates team
5. Team now has github_repo and github_branches configured

### File Browsing & Access
1. User selects a branch
2. Frontend calls `fetch_branch_files()` → gets full file tree (backend validates branch access)
3. User clicks a file
4. Frontend calls `fetch_file_content()` → gets file content (backend validates access again)

### Token Management
- **App JWT**: Generated fresh for each installation token request (8-minute lifetime)
- **Installation Token**: Requested via App JWT, valid for 1 hour, used for all GitHub API calls
- **PAT**: Used only during initial repo connection (connect_github_repo), not stored

---

## Database Interactions

### Tables Modified
- **teams**: github_repo, github_branches, github_installation_id, github_oauth_token (temporary)
- **team_members**: team_id, user_id, role, branches, created_at

### Access Patterns
- Membership check: team_members table (.eq("team_id", team_id).eq("user_id", user_id))
- Profile enrichment: Batch fetch from profiles table using .in_("id", user_ids)
- Team queries: Batch fetch from teams table using .in_("id", team_ids)
- Branch assignments: Store as array in team_members.branches, check .in_(user_assigned_branches, branch)

---

## Error Codes Summary

| HTTP | Scenario |
|------|----------|
| 400 | Invalid input (bad URL, no fields to update, already a member, self-removal attempt) |
| 401 | Invalid GitHub PAT |
| 403 | User not admin, user not member, insufficient GitHub scopes, no branch access |
| 404 | Team not found, member not found, repo not found, branch not found, file not found, no account with email |
| 409 | User already a team member |
| 502 | GitHub API error, failed to get installation token |
| 503 | GitHub App private key not found on server, GitHub App not configured |
