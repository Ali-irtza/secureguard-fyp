from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.dependencies import get_supabase, get_current_user
from app.models.teams import (
    TeamCreateRequest,
    TeamUpdateRequest,
    InviteMemberRequest,
    UpdateMemberRequest,
    TeamResponse,
    TeamListResponse,
    TeamMemberResponse,
    TeamMemberBase,
    MemberProfile,
    TeamRole,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
# Private functions (prefixed with _) used only within this module.
# DRY principle: shared logic extracted once, called from multiple routes.
# ---------------------------------------------------------------------------

def _require_admin(team_id: str, user_id: str, supabase: Client) -> None:
    """
    Raises 403 if the given user is not an admin of the given team.
    Called at the top of every admin-only endpoint.
    """
    result = (
        supabase.table("team_members")
        .select("role")
        .eq("team_id", team_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not result.data or result.data["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only team admins can perform this action",
        )


def _require_member(team_id: str, user_id: str, supabase: Client) -> dict:
    """
    Raises 403 if the user is not a member of the team.
    Returns the membership row so callers can read the role without a second query.
    """
    result = (
        supabase.table("team_members")
        .select("*")
        .eq("team_id", team_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this team",
        )
    return result.data


def _build_team_response(team: dict, members: list, current_user_id: str) -> TeamResponse:
    """
    Assembles a TeamResponse from raw DB rows.
    Centralises the mapping logic — called from GET /teams and GET /teams/{id}.
    """
    # Find the calling user's role in this team
    current_user_role = TeamRole.viewer
    for m in members:
        if m["user_id"] == current_user_id:
            current_user_role = TeamRole(m["role"])
            break

    member_responses = [
        TeamMemberResponse(
            id=m["id"],
            user_id=m["user_id"],
            role=TeamRole(m["role"]),
            branch=m.get("branch"),
            joined_at=m["created_at"],
            profile=MemberProfile(
                id=m["user_id"],
                full_name=m.get("profiles", {}).get("full_name") if m.get("profiles") else None,
                avatar_url=m.get("profiles", {}).get("avatar_url") if m.get("profiles") else None,
                email=m.get("email"),  # injected separately (see _enrich_members_with_email)
            ),
        )
        for m in members
    ]

    return TeamResponse(
        id=team["id"],
        name=team["name"],
        github_repo=team.get("github_repo"),
        created_by=team["created_by"],
        created_at=team["created_at"],
        updated_at=team["updated_at"],
        current_user_role=current_user_role,
        member_count=len(member_responses),
        members=member_responses,
    )


def _fetch_members_for_team(team_id: str, supabase: Client) -> list:
    """
    Fetches all team_members rows for a team, then enriches each with profile data.

    Why two queries instead of a join?
    team_members.user_id → auth.users.id → profiles.id
    PostgREST cannot auto-join across the auth schema boundary, so we fetch
    profiles separately using the collected user_ids and merge in Python.
    """
    members_result = (
        supabase.table("team_members")
        .select("*")
        .eq("team_id", team_id)
        .execute()
    )
    members = members_result.data or []
    if not members:
        return []

    # Collect all user_ids, fetch their profiles in one query
    user_ids = [m["user_id"] for m in members]
    profiles_result = (
        supabase.table("profiles")
        .select("id, full_name, avatar_url")
        .in_("id", user_ids)
        .execute()
    )
    # Build a lookup dict: user_id → profile row
    profiles_map = {p["id"]: p for p in (profiles_result.data or [])}

    # Attach profile data to each member row
    for m in members:
        m["profiles"] = profiles_map.get(m["user_id"], {})

    return members


# ---------------------------------------------------------------------------
# GET /teams
# ---------------------------------------------------------------------------
# Returns all teams the current user belongs to, with full member lists.
# This is the primary load call — Team.tsx calls this on mount.
# ---------------------------------------------------------------------------

@router.get("", response_model=TeamListResponse)
async def list_teams(
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Returns every team the authenticated user is a member of.
    Each team includes the full member list and the caller's role.
    """
    user_id = current_user.id

    # Step 1: find all team_ids this user belongs to
    memberships = (
        supabase.table("team_members")
        .select("team_id")
        .eq("user_id", user_id)
        .execute()
    )
    team_ids = [m["team_id"] for m in (memberships.data or [])]

    if not team_ids:
        return TeamListResponse(teams=[])

    # Step 2: fetch those teams
    teams_result = (
        supabase.table("teams")
        .select("*")
        .in_("id", team_ids)
        .execute()
    )
    teams = teams_result.data or []

    # Step 3: build full response for each team
    team_responses = []
    for team in teams:
        members = _fetch_members_for_team(team["id"], supabase)
        team_responses.append(_build_team_response(team, members, user_id))

    return TeamListResponse(teams=team_responses)


# ---------------------------------------------------------------------------
# POST /teams
# ---------------------------------------------------------------------------
# Creates a new team and automatically adds the creator as admin.
# ---------------------------------------------------------------------------

@router.post("", response_model=TeamResponse, status_code=status.HTTP_201_CREATED)
async def create_team(
    body: TeamCreateRequest,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Creates a new team. The authenticated user becomes the admin automatically.
    """
    user_id = current_user.id

    # Insert the team row
    team_result = (
        supabase.table("teams")
        .insert({"name": body.name, "created_by": user_id})
        .execute()
    )
    team = team_result.data[0]

    # Add creator as admin member
    supabase.table("team_members").insert({
        "team_id": team["id"],
        "user_id": user_id,
        "role":    "admin",
    }).execute()

    # Return the full team object (with the creator as the only member)
    members = _fetch_members_for_team(team["id"], supabase)
    return _build_team_response(team, members, user_id)


# ---------------------------------------------------------------------------
# GET /teams/{team_id}
# ---------------------------------------------------------------------------

@router.get("/{team_id}", response_model=TeamResponse)
async def get_team(
    team_id: str,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Returns a single team by ID.
    The caller must be a member of the team.
    """
    user_id = current_user.id
    _require_member(team_id, user_id, supabase)  # 403 if not a member

    team_result = (
        supabase.table("teams")
        .select("*")
        .eq("id", team_id)
        .single()
        .execute()
    )
    if not team_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    members = _fetch_members_for_team(team_id, supabase)
    return _build_team_response(team_result.data, members, user_id)


# ---------------------------------------------------------------------------
# PATCH /teams/{team_id}
# ---------------------------------------------------------------------------
# Covers: rename team, connect GitHub repo, disconnect GitHub repo.
# Admin only.
# ---------------------------------------------------------------------------

@router.patch("/{team_id}", response_model=TeamResponse)
async def update_team(
    team_id: str,
    body: TeamUpdateRequest,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Partial update for a team (name, github_repo).
    Only admins can call this.
    """
    user_id = current_user.id
    _require_admin(team_id, user_id, supabase)

    # Build update payload — only include fields that were actually sent
    updates = {}
    if body.name        is not None: updates["name"]        = body.name
    if body.github_repo is not None: updates["github_repo"] = body.github_repo

    # Allow explicitly setting github_repo to empty string to disconnect
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields provided to update",
        )

    team_result = (
        supabase.table("teams")
        .update(updates)
        .eq("id", team_id)
        .execute()
    )
    if not team_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    members = _fetch_members_for_team(team_id, supabase)
    return _build_team_response(team_result.data[0], members, user_id)


# ---------------------------------------------------------------------------
# DELETE /teams/{team_id}
# ---------------------------------------------------------------------------
# Admin only. Cascades to team_members (handled by DB ON DELETE CASCADE).
# ---------------------------------------------------------------------------

@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_team(
    team_id: str,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Permanently deletes a team and removes all members.
    Only the team admin can do this.
    """
    user_id = current_user.id
    _require_admin(team_id, user_id, supabase)

    supabase.table("teams").delete().eq("id", team_id).execute()


# ---------------------------------------------------------------------------
# POST /teams/{team_id}/members
# ---------------------------------------------------------------------------
# Invite a user by email. Looks up their account — if found, adds them.
# Admin only.
# ---------------------------------------------------------------------------

@router.post("/{team_id}/members", response_model=TeamMemberResponse, status_code=status.HTTP_201_CREATED)
async def invite_member(
    team_id: str,
    body: InviteMemberRequest,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Adds a user to the team by their email address.
    The user must already have an account in the system.
    Admin only.
    """
    user_id = current_user.id
    _require_admin(team_id, user_id, supabase)

    # Look up the invitee's user ID from auth.users via service_role
    # We use the admin API (list_users) to find by email
    users_response = supabase.auth.admin.list_users()
    invitee = next(
        (u for u in users_response if u.email and u.email.lower() == body.email),
        None,
    )

    if not invitee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account found with that email address",
        )

    if invitee.id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You are already a member of this team",
        )

    # Check if already a member
    existing = (
        supabase.table("team_members")
        .select("id")
        .eq("team_id", team_id)
        .eq("user_id", invitee.id)
        .execute()
    )
    if existing.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This user is already a member of the team",
        )

    # Add the member
    member_result = (
        supabase.table("team_members")
        .insert({
            "team_id": team_id,
            "user_id": invitee.id,
            "role":    body.role.value,
        })
        .execute()
    )
    new_member = member_result.data[0]

    # Fetch their profile for the response
    profile_result = (
        supabase.table("profiles")
        .select("full_name, avatar_url")
        .eq("id", invitee.id)
        .single()
        .execute()
    )
    profile_data = profile_result.data or {}

    return TeamMemberResponse(
        id=new_member["id"],
        user_id=invitee.id,
        role=TeamRole(new_member["role"]),
        branch=new_member.get("branch"),
        joined_at=new_member["created_at"],
        profile=MemberProfile(
            id=invitee.id,
            full_name=profile_data.get("full_name"),
            avatar_url=profile_data.get("avatar_url"),
            email=invitee.email,
        ),
    )


# ---------------------------------------------------------------------------
# PATCH /teams/{team_id}/members/{member_user_id}
# ---------------------------------------------------------------------------
# Update a member's role and/or assigned branch.
# Admin only. Admins cannot demote themselves.
# ---------------------------------------------------------------------------

@router.patch("/{team_id}/members/{member_user_id}", response_model=TeamMemberResponse)
async def update_member(
    team_id: str,
    member_user_id: str,
    body: UpdateMemberRequest,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Updates a team member's role and/or branch assignment.
    Admin only. An admin cannot change their own role.
    """
    user_id = current_user.id
    _require_admin(team_id, user_id, supabase)

    if member_user_id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admins cannot change their own role",
        )

    updates: dict = {"role": body.role.value}
    if body.branch is not None:
        updates["branch"] = body.branch

    member_result = (
        supabase.table("team_members")
        .update(updates)
        .eq("team_id", team_id)
        .eq("user_id", member_user_id)
        .execute()
    )
    if not member_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    updated = member_result.data[0]

    profile_result = (
        supabase.table("profiles")
        .select("full_name, avatar_url")
        .eq("id", member_user_id)
        .single()
        .execute()
    )
    profile_data = profile_result.data or {}

    return TeamMemberResponse(
        id=updated["id"],
        user_id=member_user_id,
        role=TeamRole(updated["role"]),
        branch=updated.get("branch"),
        joined_at=updated["created_at"],
        profile=MemberProfile(
            id=member_user_id,
            full_name=profile_data.get("full_name"),
            avatar_url=profile_data.get("avatar_url"),
            email=None,  # not needed for update response
        ),
    )


# ---------------------------------------------------------------------------
# DELETE /teams/{team_id}/members/{member_user_id}
# ---------------------------------------------------------------------------
# Remove a member from the team.
# Admin only. Admins cannot remove themselves.
# ---------------------------------------------------------------------------

@router.delete("/{team_id}/members/{member_user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    team_id: str,
    member_user_id: str,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Removes a member from the team.
    Admin only. An admin cannot remove themselves.
    """
    user_id = current_user.id
    _require_admin(team_id, user_id, supabase)

    if member_user_id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admins cannot remove themselves from the team",
        )

    supabase.table("team_members").delete().eq("team_id", team_id).eq("user_id", member_user_id).execute()
