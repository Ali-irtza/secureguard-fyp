from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime
from enum import Enum


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------
# Mirror the PostgreSQL ENUM types defined in our migration.
# Using Python Enum ensures only valid values are accepted — validated
# automatically by Pydantic before any business logic runs.
# ---------------------------------------------------------------------------

class TeamRole(str, Enum):
    admin     = "admin"
    developer = "developer"
    viewer    = "viewer"


# ---------------------------------------------------------------------------
# Shared / Base Schemas
# ---------------------------------------------------------------------------
# DRY principle: common fields defined once, reused via inheritance.
# ---------------------------------------------------------------------------

class TeamMemberBase(BaseModel):
    """Fields shared between member create and update operations."""
    role:   TeamRole        = TeamRole.developer
    branch: Optional[str]  = None


class TeamBase(BaseModel):
    """Fields shared between team create and update operations."""
    name: str

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Team name cannot be blank")
        return v.strip()


# ---------------------------------------------------------------------------
# Request Schemas  (frontend → backend)
# ---------------------------------------------------------------------------

class TeamCreateRequest(TeamBase):
    """
    POST /teams
    Creates a new team. The creator is automatically added as admin.
    """
    pass  # inherits name + validator from TeamBase


class TeamUpdateRequest(BaseModel):
    """
    PATCH /teams/{team_id}
    Partial update — all fields optional.
    Covers: rename team, disconnect GitHub repo.
    """
    name:        Optional[str] = None
    github_repo: Optional[str] = None

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.strip():
            raise ValueError("Team name cannot be blank")
        return v.strip() if v else v


class ConnectGithubRequest(BaseModel):
    """
    POST /teams/{team_id}/github
    Connect a GitHub repository using a Personal Access Token.

    The PAT is used ONCE to:
      1. Validate the repo exists and is accessible
      2. Fetch the branch list
    It is NEVER stored — discarded immediately after the API call.
    """
    repo_url: str
    pat:      str  # Personal Access Token — read-only repo scope required

    @field_validator("repo_url")
    @classmethod
    def repo_url_must_not_be_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Repository URL cannot be blank")
        return v.strip()

    @field_validator("pat")
    @classmethod
    def pat_must_not_be_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Personal Access Token cannot be blank")
        return v.strip()


class InviteMemberRequest(BaseModel):
    """
    POST /teams/{team_id}/members
    Invite a user to the team by their email address.
    Only admins can call this endpoint.
    """
    email: str
    role:  TeamRole = TeamRole.developer

    @field_validator("email")
    @classmethod
    def email_must_not_be_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Email cannot be blank")
        return v.strip().lower()


class UpdateMemberRequest(BaseModel):
    """
    PATCH /teams/{team_id}/members/{user_id}
    Update a member's role and/or assigned branches.
    Only admins can call this endpoint.
    """
    role:     Optional[TeamRole]   = None
    branches: Optional[List[str]]  = None


# ---------------------------------------------------------------------------
# Response Schemas  (backend → frontend)
# ---------------------------------------------------------------------------

class MemberProfile(BaseModel):
    """
    Embedded profile data returned alongside each team member.
    Sourced from the profiles table — never from auth.users directly.
    """
    id:         str
    full_name:  Optional[str] = None
    avatar_url: Optional[str] = None
    email:      Optional[str] = None  # fetched from auth.users via service_role


class TeamMemberResponse(BaseModel):
    """
    A single member row as returned by the API.
    Combines team_members table data with the member's profile.
    """
    id:         str               # team_members.id (the junction row id)
    user_id:    str
    role:       TeamRole
    branches:   Optional[List[str]] = None
    profile:    MemberProfile
    joined_at:  datetime            # team_members.created_at


class TeamResponse(BaseModel):
    """
    Full team object returned to the frontend.
    Includes the current user's role so the UI can gate admin-only controls.
    """
    id:                str
    name:              str
    github_repo:       Optional[str]   = None
    github_branches:   List[str]       = []   # populated after GitHub connect
    created_by:        str
    created_at:        datetime
    updated_at:        datetime
    current_user_role: TeamRole        # derived: the calling user's role in this team
    member_count:      int             # derived: len(members)
    members:           List[TeamMemberResponse]


class TeamListResponse(BaseModel):
    """
    Response for GET /teams — list of all teams the user belongs to.
    """
    teams: List[TeamResponse]


class GithubAuthorizeResponse(BaseModel):
    """
    Response for GET /teams/{team_id}/github/authorize
    Returns the GitHub OAuth URL the frontend should redirect the user to.
    """
    authorization_url: str


class BranchFileItem(BaseModel):
    """
    A single file or directory entry in a branch's file tree.
    Returned by the Git Trees API.
    """
    path:  str
    type:  str            # "file" or "directory"
    size:  Optional[int] = None  # bytes, only for files (blobs)


class BranchFilesResponse(BaseModel):
    """
    Response for GET /teams/{team_id}/branches/{branch}/files
    """
    branch: str
    files:  List[BranchFileItem]


class FileContentResponse(BaseModel):
    """
    Response for GET /teams/{team_id}/branches/{branch}/files/content
    Returns the decoded text content of a single file.
    """
    branch:   str
    path:     str
    content:  str           # decoded file content (UTF-8 text)
    size:     int           # size in bytes
    encoding: str = "utf-8"


class TeamDashboardMetrics(BaseModel):
    totalScans: int
    criticalVulns: int
    healthScore: int


class TeamDashboardMember(BaseModel):
    userId: str
    name: str
    initials: str
    role: TeamRole
    branches: List[str]
    branch: str
    healthScore: Optional[int] = None
    lastScanAt: Optional[datetime] = None


class TeamDashboardScan(BaseModel):
    id: str
    projectName: str
    date: datetime
    status: str
    branch: Optional[str] = None
    memberId: Optional[str] = None
    memberName: Optional[str] = None
    vulnerabilities: dict[str, int]


class TeamDashboardTrendPoint(BaseModel):
    date: str
    critical: int
    high: int
    medium: int


class TeamDashboardCriticalAlert(BaseModel):
    id: str
    title: str
    project: str
    timeAgo: str
    createdAt: datetime
    memberName: Optional[str] = None
    branch: Optional[str] = None


class TeamDashboardResponse(BaseModel):
    metrics: TeamDashboardMetrics
    members: List[TeamDashboardMember]
    recentScans: List[TeamDashboardScan]
    vulnerabilityTrend: List[TeamDashboardTrendPoint]
    criticalAlerts: List[TeamDashboardCriticalAlert]
