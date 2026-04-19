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
    Covers: rename team, connect/disconnect GitHub repo.
    """
    name:        Optional[str] = None
    github_repo: Optional[str] = None

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.strip():
            raise ValueError("Team name cannot be blank")
        return v.strip() if v else v


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


class UpdateMemberRequest(TeamMemberBase):
    """
    PATCH /teams/{team_id}/members/{user_id}
    Update a member's role and/or assigned branch.
    Only admins can call this endpoint.
    """
    pass  # inherits role + branch from TeamMemberBase


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
    id:         str           # team_members.id (the junction row id)
    user_id:    str
    role:       TeamRole
    branch:     Optional[str] = None
    profile:    MemberProfile
    joined_at:  datetime      # team_members.created_at


class TeamResponse(BaseModel):
    """
    Full team object returned to the frontend.
    Includes the current user's role so the UI can gate admin-only controls.
    """
    id:               str
    name:             str
    github_repo:      Optional[str]  = None
    created_by:       str
    created_at:       datetime
    updated_at:       datetime
    current_user_role: TeamRole      # derived: the calling user's role in this team
    member_count:     int            # derived: len(members)
    members:          List[TeamMemberResponse]


class TeamListResponse(BaseModel):
    """
    Response for GET /teams — list of all teams the user belongs to.
    """
    teams: List[TeamResponse]
