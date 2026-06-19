from fastapi import HTTPException, status
from supabase import Client
from app.models.teams import TeamMemberResponse, MemberProfile, TeamRole
from app.config import settings
from app.services.email_service import send_team_invite_email
from app.services.teams.team_service import require_admin


def _member_branches(member: dict) -> list[str]:
    assigned_branch = member.get("assigned_branch")
    if not assigned_branch:
        return []
    if isinstance(assigned_branch, list):
        return [branch for branch in assigned_branch if branch]
    return [assigned_branch]


def _profile_by_email(email: str, supabase: Client) -> dict | None:
    try:
        result = (
            supabase.table("profiles")
            .select("user_id, full_name, avatar_url, email")
            .ilike("email", email)
            .limit(1)
            .execute()
        )
        return (result.data or [None])[0]
    except Exception:
        result = (
            supabase.table("profiles")
            .select("id, full_name, avatar_url, email")
            .ilike("email", email)
            .limit(1)
            .execute()
        )
        profile = (result.data or [None])[0]
        if not profile:
            return None
        return {**profile, "user_id": profile["id"]}


def _profile_by_user_id(user_id: str, supabase: Client) -> dict:
    try:
        result = (
            supabase.table("profiles")
            .select("user_id, full_name, avatar_url, email")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        return (result.data or [{}])[0] or {}
    except Exception:
        result = (
            supabase.table("profiles")
            .select("id, full_name, avatar_url, email")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        profile = (result.data or [{}])[0] or {}
        return {**profile, "user_id": profile.get("id")} if profile else {}


def _team_name(team_id: str, supabase: Client) -> str:
    result = (
        supabase.table("team")
        .select("team_name")
        .eq("team_id", team_id)
        .limit(1)
        .execute()
    )
    return ((result.data or [{}])[0] or {}).get("team_name") or "SecureGuard team"


def _response(member: dict, profile: dict) -> TeamMemberResponse:
    return TeamMemberResponse(
        id=member["team_member_id"],
        user_id=member["user_id"],
        role=TeamRole(member["assigned_role"]),
        branches=_member_branches(member),
        joined_at=member["joined_at"],
        profile=MemberProfile(
            id=member["user_id"],
            full_name=profile.get("full_name"),
            avatar_url=profile.get("avatar_url"),
            email=profile.get("email"),
        ),
    )


def invite_user_to_team(team_id: str, email: str, role: str, current_user_id: str, supabase: Client) -> TeamMemberResponse:
    require_admin(team_id, current_user_id, supabase)

    if role == "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A team can have only one admin",
        )

    invitee = _profile_by_email(email, supabase)
    if not invitee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No SecureGuard account found with that email address",
        )

    invitee_id = invitee["user_id"]
    if invitee_id == current_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You are already a member of this team",
        )

    existing = (
        supabase.table("team_members")
        .select("team_member_id, status")
        .eq("team_id", team_id)
        .eq("user_id", invitee_id)
        .limit(1)
        .execute()
    )
    if existing.data:
        if existing.data[0].get("status") == "active":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This user is already a member of the team",
            )
        member_result = (
            supabase.table("team_members")
            .update({"assigned_role": role, "assigned_branch": None, "status": "pending"})
            .eq("team_member_id", existing.data[0]["team_member_id"])
            .execute()
        )
    else:
        member_result = (
            supabase.table("team_members")
            .insert(
                {
                    "team_id": team_id,
                    "user_id": invitee_id,
                    "assigned_role": role,
                    "assigned_branch": None,
                    "status": "pending",
                }
            )
            .execute()
        )

    member = member_result.data[0]

    try:
        inviter = _profile_by_user_id(current_user_id, supabase)
        send_team_invite_email(
            to_email=invitee["email"],
            team_name=_team_name(team_id, supabase),
            inviter_name=inviter.get("full_name") or inviter.get("email") or "A SecureGuard admin",
            role=role,
            frontend_base_url=settings.frontend_base_url,
            team_id=team_id,
        )
    except Exception:
        pass

    return _response(member, invitee)


def accept_team_invite(team_id: str, current_user_id: str, supabase: Client) -> TeamMemberResponse:
    member_result = (
        supabase.table("team_members")
        .select("*")
        .eq("team_id", team_id)
        .eq("user_id", current_user_id)
        .limit(1)
        .execute()
    )
    member = (member_result.data or [None])[0]
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
    if member.get("status") == "removed":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This invitation is no longer active")
    if member.get("status") != "active":
        updated = (
            supabase.table("team_members")
            .update({"status": "active"})
            .eq("team_member_id", member["team_member_id"])
            .execute()
        )
        member = updated.data[0]
    return _response(member, _profile_by_user_id(current_user_id, supabase))


def update_team_member(team_id: str, member_user_id: str, role: str | None, branches: list[str] | None, current_user_id: str, supabase: Client) -> TeamMemberResponse:
    require_admin(team_id, current_user_id, supabase)

    updates = {}
    if role is not None:
        if member_user_id == current_user_id and role != "admin":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Admins cannot change their own role",
            )
        if role == "admin" and member_user_id != current_user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A team can have only one admin",
            )
        updates["assigned_role"] = role

    if branches is not None:
        updates["assigned_branch"] = branches[0] if branches else None

    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    member_result = (
        supabase.table("team_members")
        .update(updates)
        .eq("team_id", team_id)
        .eq("user_id", member_user_id)
        .eq("status", "active")
        .execute()
    )
    member = (member_result.data or [None])[0]
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    return _response(member, _profile_by_user_id(member_user_id, supabase))


def remove_team_member(team_id: str, member_user_id: str, current_user_id: str, supabase: Client) -> None:
    require_admin(team_id, current_user_id, supabase)

    if member_user_id == current_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admins cannot remove themselves from the team",
        )

    supabase.table("team_members").update({"status": "removed"}).eq("team_id", team_id).eq("user_id", member_user_id).execute()
