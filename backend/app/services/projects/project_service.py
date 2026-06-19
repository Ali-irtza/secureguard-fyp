from fastapi import HTTPException, status
from supabase import Client

from app.models.projects import (
    BulkDeleteResponse,
    ProjectCreateRequest,
    ProjectListResponse,
    ProjectResponse,
    ProjectUpdateRequest,
)
from app.services.teams.team_service import require_member


def _to_project_response(row: dict) -> ProjectResponse:
    team_id = row.get("team_id")
    return ProjectResponse(
        id=row["project_id"],
        name=row["project_name"],
        language=row.get("project_language"),
        health_score=row.get("health_score"),
        type=row.get("project_type") or "personal",
        owner_id=row["user_id"],
        team_id=team_id,
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
        if result.data.get("project_type") == "team":
            team_result = (
                supabase.table("team")
                .select("team_id")
                .eq("project_id", project_id)
                .limit(1)
                .execute()
            )
            team = (team_result.data or [None])[0]
            if team:
                require_member(team["team_id"], user_id, supabase)
                result.data["team_id"] = team["team_id"]
                return result.data
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
    projects_by_id = {row["project_id"]: row for row in (result.data or [])}

    memberships = (
        supabase.table("team_members")
        .select("team_id")
        .eq("user_id", user_id)
        .eq("status", "active")
        .execute()
    )
    team_ids = [row["team_id"] for row in (memberships.data or [])]
    team_links: dict[str, str] = {}
    if team_ids:
        teams_result = (
            supabase.table("team")
            .select("team_id, project_id")
            .in_("team_id", team_ids)
            .execute()
        )
        project_ids = []
        for team in teams_result.data or []:
            if team.get("project_id"):
                team_links[team["project_id"]] = team["team_id"]
                project_ids.append(team["project_id"])
        missing_ids = [project_id for project_id in project_ids if project_id not in projects_by_id]
        if missing_ids:
            team_projects = (
                supabase.table("projects")
                .select("*")
                .in_("project_id", missing_ids)
                .execute()
            )
            for row in team_projects.data or []:
                projects_by_id[row["project_id"]] = row

    projects = []
    for row in projects_by_id.values():
        enriched = {**row}
        if enriched["project_id"] in team_links:
            enriched["team_id"] = team_links[enriched["project_id"]]
        projects.append(_to_project_response(enriched))
    projects.sort(key=lambda item: item.created_at, reverse=True)
    return ProjectListResponse(projects=projects)


def create_project(body: ProjectCreateRequest, user_id: str, supabase: Client) -> ProjectResponse:
    if body.type == "team":
        if not body.team_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Team project requires a team_id.",
            )
        membership = require_member(body.team_id, user_id, supabase)
        if membership.get("role") == "viewer":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Viewers cannot create team scan projects.",
            )

    payload = {
        "user_id": user_id,
        "project_name": body.name,
        "project_type": body.type,
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

    project = result.data[0]
    if body.type == "team" and body.team_id:
        supabase.table("team").update({"project_id": project["project_id"]}).eq("team_id", body.team_id).execute()
        project["team_id"] = body.team_id

    return _to_project_response(project)


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
