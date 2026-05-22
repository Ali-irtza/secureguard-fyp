# ---------------------------------------------------------------------------
# Route Ordering Note
# ---------------------------------------------------------------------------
# The DELETE "/bulk-delete" route MUST be registered BEFORE "/{project_id}".
# FastAPI matches routes in registration order. If "/{project_id}" came first,
# the literal string "bulk-delete" would be captured as a project_id path
# parameter instead of routing to the bulk-delete handler.
# ---------------------------------------------------------------------------

from fastapi import APIRouter, Depends, status
from supabase import Client

from app.dependencies import get_supabase, get_current_user
from app.models.projects import (
    ProjectCreateRequest, ProjectUpdateRequest, BulkDeleteRequest,
    ProjectResponse, ProjectListResponse, BulkDeleteResponse,
)
from app.services.projects import project_service

router = APIRouter()


@router.get("", response_model=ProjectListResponse)
async def list_projects(
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    return project_service.list_user_projects(current_user.id, supabase)


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ProjectCreateRequest,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    return project_service.create_project(body, current_user.id, supabase)


@router.delete("/bulk-delete", response_model=BulkDeleteResponse)  # MUST come before /{project_id}
async def bulk_delete_projects(
    body: BulkDeleteRequest,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    return project_service.bulk_delete_projects(body.ids, current_user.id, supabase)


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    return project_service.get_project_by_id(project_id, current_user.id, supabase)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    body: ProjectUpdateRequest,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    return project_service.update_project(project_id, body, current_user.id, supabase)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: str,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    project_service.delete_project(project_id, current_user.id, supabase)
