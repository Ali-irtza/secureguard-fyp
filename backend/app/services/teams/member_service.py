from fastapi import HTTPException, status
from supabase import Client
from app.models.teams import (
    TeamMemberResponse,
    MemberProfile,
    TeamRole,
)
from app.services.teams.team_service import require_admin

def invite_user_to_team(team_id: str, email: str, role: str, current_user_id: str, supabase: Client) -> TeamMemberResponse:
    """Adds a user to the team by their email address."""
    require_admin(team_id, current_user_id, supabase)

    users_response = supabase.auth.admin.list_users()
    invitee = next(
        (u for u in users_response if u.email and u.email.lower() == email.lower()),
        None,
    )

    if not invitee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account found with that email address",
        )

    if invitee.id == current_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You are already a member of this team",
        )

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

    member_result = (
        supabase.table("team_members")
        .insert({
            "team_id": team_id,
            "user_id": invitee.id,
            "role":    role,
        })
        .execute()
    )
    new_member = member_result.data[0]

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
        branches=new_member.get("branches"),
        joined_at=new_member["created_at"],
        profile=MemberProfile(
            id=invitee.id,
            full_name=profile_data.get("full_name"),
            avatar_url=profile_data.get("avatar_url"),
            email=invitee.email,
        ),
    )

def update_team_member(team_id: str, member_user_id: str, role: str | None, branches: list[str] | None, current_user_id: str, supabase: Client) -> TeamMemberResponse:
    """Updates a team member's role and/or branch assignments."""
    require_admin(team_id, current_user_id, supabase)

    updates: dict = {}
    
    if role is not None:
        if member_user_id == current_user_id and role != "admin":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Admins cannot change their own role",
            )
        updates["role"] = role

    if branches is not None:
        updates["branches"] = branches

    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

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
        branches=updated.get("branches"),
        joined_at=updated["created_at"],
        profile=MemberProfile(
            id=member_user_id,
            full_name=profile_data.get("full_name"),
            avatar_url=profile_data.get("avatar_url"),
            email=None, 
        ),
    )

def remove_team_member(team_id: str, member_user_id: str, current_user_id: str, supabase: Client) -> None:
    """Removes a member from the team."""
    require_admin(team_id, current_user_id, supabase)

    if member_user_id == current_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admins cannot remove themselves from the team",
        )

    supabase.table("team_members").delete().eq("team_id", team_id).eq("user_id", member_user_id).execute()
