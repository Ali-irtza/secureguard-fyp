from fastapi import APIRouter, Depends, UploadFile, File, status
from supabase import Client

from app.dependencies import get_supabase, get_current_user
from app.models.project_files import (
    GitHubImportRequest,
    ProjectFileListResponse,
    ProjectFileResponse,
    ProjectFileDeleteResponse,
)
from app.services.project_files import file_service

router = APIRouter()


@router.get("/{project_id}/files", response_model=ProjectFileListResponse)
async def list_files(
    project_id: str,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """List all files for a project, including source tags (local / github)."""
    return file_service.list_project_files(project_id, current_user.id, supabase)


@router.post(
    "/{project_id}/files",
    response_model=ProjectFileResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_file(
    project_id: str,
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Upload a local source file to a project.
    Allowed extensions enforced by project language (C → .c/.h, C++ → .cpp etc.).
    Max 10 MB.
    """
    return await file_service.upload_project_file(
        project_id, current_user.id, file, supabase
    )


# NOTE: This route MUST be registered before /{project_id}/files/{filename}
# so FastAPI does not capture "github-import" as a filename path parameter.
@router.post(
    "/{project_id}/files/github-import",
    response_model=ProjectFileResponse,
    status_code=status.HTTP_201_CREATED,
)
async def import_github_file(
    project_id: str,
    body: GitHubImportRequest,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """
    Import a single file from the team's connected GitHub repository.

    Access rules:
      - Project must be a team project with a connected GitHub repo.
      - Only admins and developers can import.
      - Developers may only import from their assigned branches.
      - File extension must match the project's language.

    The file is fetched from GitHub once and saved to Supabase Storage,
    tagged with source="github" and the originating branch.
    """
    return await file_service.import_github_file(
        project_id, current_user.id, body, supabase
    )


@router.delete(
    "/{project_id}/files/{filename}",
    response_model=ProjectFileDeleteResponse,
)
async def delete_file(
    project_id: str,
    filename: str,
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase),
):
    """Delete a single file from a project. Owner only."""
    return file_service.delete_project_file(
        project_id, filename, current_user.id, supabase
    )
