from fastapi import HTTPException, status
from supabase import Client
from typing import List
from app.models.projects import (
    ProjectCreateRequest, ProjectUpdateRequest, BulkDeleteRequest,
    ProjectResponse, ProjectListResponse, BulkDeleteResponse
)


def require_owner(project_id: str, user_id: str, supabase: Client) -> dict:
    """Fetches the project and raises 404/403 if not found or not owned."""
    result = (
        supabase.table("projects")
        .select("*")
        .eq("id", project_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    if result.data["owner_id"] != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not own this project",
        )
    return result.data


def list_user_projects(user_id: str, supabase: Client) -> ProjectListResponse:
    """
    Fetches personal projects (owner_id = user_id) AND team projects
    (team_id IN user's team memberships) in a single query using .or() filter.
    """
    memberships = (
        supabase.table("team_members")
        .select("team_id")
        .eq("user_id", user_id)
        .execute()
    )
    team_ids = [m["team_id"] for m in (memberships.data or [])]

    filter_str = f"owner_id.eq.{user_id}"
    if team_ids:
        team_ids_csv = ",".join(team_ids)
        filter_str += f",team_id.in.({team_ids_csv})"

    result = (
        supabase.table("projects")
        .select("*")
        .or_(filter_str)
        .execute()
    )
    return ProjectListResponse(
        projects=[ProjectResponse(**row) for row in (result.data or [])]
    )


def create_project(body: ProjectCreateRequest, user_id: str, supabase: Client) -> ProjectResponse:
    """Validates name/team_id, inserts row with owner_id = user_id.

    For team projects, the calling user must be an admin of the target team.
    Developers and viewers are not permitted to create projects under a team.
    """
    if body.type == "team" and body.team_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="team_id is required for team projects",
        )

    if body.type == "team" and body.team_id is not None:
        # Verify the user is a member of the team and has the admin role.
        membership = (
            supabase.table("team_members")
            .select("role")
            .eq("team_id", body.team_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not membership.data:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of this team",
            )
        member_role = membership.data[0]["role"]
        if member_role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Only team admins can create projects under a team. "
                    f"Your current role is '{member_role}'. "
                    "Please ask a team admin to create the project, or create a new team where you are the admin."
                ),
            )

    # Build insert payload — omit None values so we don't send null
    # into NOT NULL or enum columns that don't accept null yet.
    payload: dict = {
        "name":     body.name,
        "type":     body.type,
        "owner_id": user_id,
    }
    if body.language is not None:
        payload["language"] = body.language
    if body.team_id is not None:
        payload["team_id"] = body.team_id

    result = (
        supabase.table("projects")
        .insert(payload)
        .execute()
    )
    return ProjectResponse(**result.data[0])


def get_project_by_id(project_id: str, user_id: str, supabase: Client) -> ProjectResponse:
    """Returns project if visible to user (owned or team member), else 404."""
    result = (
        supabase.table("projects")
        .select("*")
        .eq("id", project_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    row = result.data

    # Check visibility: owned by user OR user is a member of the project's team
    if row["owner_id"] == user_id:
        return ProjectResponse(**row)

    if row.get("team_id"):
        membership = (
            supabase.table("team_members")
            .select("team_id")
            .eq("team_id", row["team_id"])
            .eq("user_id", user_id)
            .execute()
        )
        if membership.data:
            return ProjectResponse(**row)

    # Don't leak existence — return 404 for non-visible projects
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Project not found",
    )


def update_project(
    project_id: str,
    body: ProjectUpdateRequest,
    user_id: str,
    supabase: Client,
) -> ProjectResponse:
    """Calls require_owner, applies partial update, returns updated row."""
    require_owner(project_id, user_id, supabase)

    updates = {}
    if body.name is not None:
        updates["name"] = body.name
    if body.language is not None:
        updates["language"] = body.language
    if body.health_score is not None:
        updates["health_score"] = body.health_score
    if body.type is not None:
        updates["type"] = body.type
    if body.team_id is not None:
        updates["team_id"] = body.team_id

    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields provided to update",
        )

    result = (
        supabase.table("projects")
        .update(updates)
        .eq("id", project_id)
        .execute()
    )
    return ProjectResponse(**result.data[0])


def delete_project(project_id: str, user_id: str, supabase: Client) -> None:
    """Calls require_owner, deletes row."""
    require_owner(project_id, user_id, supabase)
    supabase.table("projects").delete().eq("id", project_id).execute()


def bulk_delete_projects(ids: List[str], user_id: str, supabase: Client) -> BulkDeleteResponse:
    """
    Filters ids to only those owned by user_id, then deletes in one query.
    Returns {"deleted": count}. Raises 422 if no owned IDs found.
    """
    result = (
        supabase.table("projects")
        .select("id")
        .eq("owner_id", user_id)
        .in_("id", ids)
        .execute()
    )
    owned_ids = [row["id"] for row in (result.data or [])]

    if not owned_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No owned projects found in the provided IDs",
        )

    supabase.table("projects").delete().in_("id", owned_ids).execute()
    return BulkDeleteResponse(deleted=len(owned_ids))
