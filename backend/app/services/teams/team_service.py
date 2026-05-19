from fastapi import HTTPException, status
from supabase import Client
from app.models.teams import (
    TeamResponse,
    TeamListResponse,
    TeamMemberResponse,
    MemberProfile,
    TeamRole,
)

def require_admin(team_id: str, user_id: str, supabase: Client) -> None:
    """Raises 403 if the user is not a team admin."""
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

def require_member(team_id: str, user_id: str, supabase: Client) -> dict:
    """Raises 403 if the user is not a member of the team."""
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

def build_team_response(team: dict, members: list, current_user_id: str) -> TeamResponse:
    """Assembles a TeamResponse from raw DB rows."""
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
            branches=m.get("branches"),
            joined_at=m["created_at"],
            profile=MemberProfile(
                id=m["user_id"],
                full_name=m.get("profiles", {}).get("full_name") if m.get("profiles") else None,
                avatar_url=m.get("profiles", {}).get("avatar_url") if m.get("profiles") else None,
                email=m.get("email"),
            ),
        )
        for m in members
    ]

    return TeamResponse(
        id=team["id"],
        name=team["name"],
        github_repo=team.get("github_repo"),
        github_branches=team.get("github_branches") or [],
        created_by=team["created_by"],
        created_at=team["created_at"],
        updated_at=team["updated_at"],
        current_user_role=current_user_role,
        member_count=len(member_responses),
        members=member_responses,
    )

def fetch_members_for_team(team_id: str, supabase: Client) -> list:
    """Fetches members and enriches with profile data."""
    members_result = (
        supabase.table("team_members")
        .select("*")
        .eq("team_id", team_id)
        .execute()
    )
    members = members_result.data or []
    if not members:
        return []

    user_ids = [m["user_id"] for m in members]
    profiles_result = (
        supabase.table("profiles")
        .select("id, full_name, avatar_url")
        .in_("id", user_ids)
        .execute()
    )
    profiles_map = {p["id"]: p for p in (profiles_result.data or [])}

    for m in members:
        m["profiles"] = profiles_map.get(m["user_id"], {})

    return members

def list_user_teams(user_id: str, supabase: Client) -> TeamListResponse:
    """Returns all teams the user belongs to."""
    memberships = (
        supabase.table("team_members")
        .select("team_id")
        .eq("user_id", user_id)
        .execute()
    )
    team_ids = [m["team_id"] for m in (memberships.data or [])]

    if not team_ids:
        return TeamListResponse(teams=[])

    teams_result = (
        supabase.table("teams")
        .select("*")
        .in_("id", team_ids)
        .execute()
    )
    teams = teams_result.data or []

    team_responses = []
    for team in teams:
        members = fetch_members_for_team(team["id"], supabase)
        team_responses.append(build_team_response(team, members, user_id))

    return TeamListResponse(teams=team_responses)

def create_new_team(name: str, user_id: str, supabase: Client) -> TeamResponse:
    """Creates a team and makes creator admin."""
    team_result = (
        supabase.table("teams")
        .insert({"name": name, "created_by": user_id})
        .execute()
    )
    team = team_result.data[0]

    supabase.table("team_members").insert({
        "team_id": team["id"],
        "user_id": user_id,
        "role":    "admin",
    }).execute()

    members = fetch_members_for_team(team["id"], supabase)
    return build_team_response(team, members, user_id)

def get_team_by_id(team_id: str, user_id: str, supabase: Client) -> TeamResponse:
    """Returns a single team by ID."""
    require_member(team_id, user_id, supabase)

    team_result = (
        supabase.table("teams")
        .select("*")
        .eq("id", team_id)
        .single()
        .execute()
    )
    if not team_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    members = fetch_members_for_team(team_id, supabase)
    return build_team_response(team_result.data, members, user_id)

def update_team_details(team_id: str, user_id: str, name: str | None, github_repo: str | None, supabase: Client) -> TeamResponse:
    """Partial update for a team."""
    require_admin(team_id, user_id, supabase)

    updates = {}
    if name is not None: updates["name"] = name
    if github_repo is not None: updates["github_repo"] = github_repo

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

    members = fetch_members_for_team(team_id, supabase)
    return build_team_response(team_result.data[0], members, user_id)

def delete_team_by_id(team_id: str, user_id: str, supabase: Client) -> None:
    """Permanently deletes a team."""
    require_admin(team_id, user_id, supabase)
    supabase.table("teams").delete().eq("id", team_id).execute()
