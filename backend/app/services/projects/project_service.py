from fastapi import HTTPException, status
from supabase import Client

from app.models.projects import (
    BulkDeleteResponse,
    ProjectCreateRequest,
    ProjectListResponse,
    ProjectResponse,
    ProjectUpdateRequest,
)


def _to_project_response(row: dict) -> ProjectResponse:
    return ProjectResponse(
        id=row["project_id"],
        name=row["project_name"],
        language=row.get("project_language"),
        health_score=row.get("health_score"),
        type=row.get("project_type") or "personal",
        owner_id=row["user_id"],
        team_id=None,
        upload_type=row.get("upload_type"),
        github_repo=row.get("github_repo"),
        github_branches=[],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def require_owner(project_id: str, user_id: str, supabase: Client) -> dict:
    result = (
        supabase.table("projects")
        .select("*")
        .eq("project_id", project_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    if result.data["user_id"] != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not own this project",
        )
    return result.data


def list_user_projects(user_id: str, supabase: Client) -> ProjectListResponse:
    result = (
        supabase.table("projects")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return ProjectListResponse(
        projects=[_to_project_response(row) for row in (result.data or [])]
    )


def create_project(body: ProjectCreateRequest, user_id: str, supabase: Client) -> ProjectResponse:
    if body.type != "personal":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only personal projects are enabled in this step.",
        )

    payload = {
        "user_id": user_id,
        "project_name": body.name,
        "project_type": "personal",
        "upload_type": body.upload_type,
    }
    if body.language is not None:
        payload["project_language"] = body.language
    if body.github_repo is not None:
        payload["github_repo"] = body.github_repo or None

    try:
        result = supabase.table("projects").insert(payload).execute()
    except Exception as exc:
        message = str(exc).lower()
        if "duplicate" in message or "unique" in message:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A project with this name already exists.",
            ) from exc
        raise

    return _to_project_response(result.data[0])


def get_project_by_id(project_id: str, user_id: str, supabase: Client) -> ProjectResponse:
    return _to_project_response(require_owner(project_id, user_id, supabase))


def update_project(
    project_id: str,
    body: ProjectUpdateRequest,
    user_id: str,
    supabase: Client,
) -> ProjectResponse:
    require_owner(project_id, user_id, supabase)

    updates: dict = {}
    if body.name is not None:
        updates["project_name"] = body.name
    if body.language is not None:
        updates["project_language"] = body.language
    if body.health_score is not None:
        updates["health_score"] = body.health_score
    if body.github_repo is not None:
        updates["github_repo"] = body.github_repo or None
    if body.upload_type is not None:
        updates["upload_type"] = body.upload_type

    if not updates:
        return get_project_by_id(project_id, user_id, supabase)

    try:
        result = (
            supabase.table("projects")
            .update(updates)
            .eq("project_id", project_id)
            .eq("user_id", user_id)
            .execute()
        )
    except Exception as exc:
        message = str(exc).lower()
        if "duplicate" in message or "unique" in message:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A project with this name already exists.",
            ) from exc
        raise

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    return _to_project_response(result.data[0])


def delete_project(project_id: str, user_id: str, supabase: Client) -> None:
    require_owner(project_id, user_id, supabase)
    supabase.table("projects").delete().eq("project_id", project_id).eq("user_id", user_id).execute()


def bulk_delete_projects(ids: list[str], user_id: str, supabase: Client) -> BulkDeleteResponse:
    if not ids:
        return BulkDeleteResponse(deleted=0)

    result = (
        supabase.table("projects")
        .delete()
        .in_("project_id", ids)
        .eq("user_id", user_id)
        .execute()
    )
    return BulkDeleteResponse(deleted=len(result.data or []))
