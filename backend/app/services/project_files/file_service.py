import os
import base64
import io
import zipfile
from fastapi import HTTPException, UploadFile, status
from supabase import Client
from typing import List
from datetime import datetime, timezone

from app.models.project_files import (
    ALLOWED_EXTENSIONS,
    MAX_FILE_SIZE_BYTES,
    FILE_SOURCE_LOCAL,
    FILE_SOURCE_GITHUB,
    ProjectFileResponse,
    ProjectFileListResponse,
    ProjectFileDeleteResponse,
    GitHubImportRequest,
)

STORAGE_BUCKET = "project-files"
SIGNED_URL_EXPIRY_SECONDS = 3600  # 1 hour


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _require_project_access(project_id: str, user_id: str, supabase: Client) -> dict:
    """
    Fetches the project and verifies the user may upload/list files.

    Access rules:
      - Personal project  → owner only.
      - Team project      → owner, team admin, or team developer.
      - Viewer role       → denied.

    Returns the full project row on success.
    """
    result = (
        supabase.table("projects")
        .select("id, name, language, owner_id, type, team_id")
        .eq("id", project_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    project = result.data

    # Owner always has access
    if project["owner_id"] == user_id:
        return project

    # For team projects, allow admin and developer roles
    team_id = project.get("team_id")
    if project.get("type") == "team" and team_id:
        membership = (
            supabase.table("team_members")
            .select("role")
            .eq("team_id", team_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        if membership.data and membership.data["role"] in ("admin", "developer"):
            return project
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only team admins and developers can access files for this project",
        )

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have permission to access files for this project",
    )


def _require_project_owner(project_id: str, user_id: str, supabase: Client) -> dict:
    """
    Fetches the project and raises 404/403 if not found or not owned by user.
    Used for delete operations which remain owner-only.
    """
    result = (
        supabase.table("projects")
        .select("id, name, language, owner_id, type, team_id")
        .eq("id", project_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if result.data["owner_id"] != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not own this project")
    return result.data


def _validate_extension(filename: str, language: str | None) -> None:
    """Raises 422 if the file extension is not allowed for the project's language."""
    if not language:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Project has no language set. Cannot determine allowed file types.",
        )
    allowed = [*ALLOWED_EXTENSIONS.get(language, []), ".zip"]
    ext = os.path.splitext(filename)[1].lower()
    if ext not in allowed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"File type '{ext}' is not allowed for {language} projects. "
                f"Allowed extensions: {', '.join(allowed)}"
            ),
        )


def _storage_path(project_id: str, filename: str) -> str:
    """Returns the canonical storage path for a file."""
    return f"{project_id}/{filename}"


def _make_signed_url(storage_path: str, supabase: Client) -> str:
    """Generates a 1-hour signed download URL for a stored file."""
    signed = supabase.storage.from_(STORAGE_BUCKET).create_signed_url(
        storage_path, SIGNED_URL_EXPIRY_SECONDS
    )
    return signed.get("signedURL") or signed.get("signed_url") or ""


def _upload_bytes(
    storage_path: str,
    content: bytes,
    content_type: str,
    supabase: Client,
) -> None:
    """
    Upserts raw bytes into Supabase Storage.
    Overwrites any existing file at the same path.
    """
    file_options: dict = {
        "content-type": content_type,
        "upsert": "true",
        "x-upsert": "true",
    }
    supabase.storage.from_(STORAGE_BUCKET).upload(storage_path, content, file_options=file_options)


def _upsert_db_record(
    project_id: str,
    user_id: str,
    filename: str,
    storage_path: str,
    size: int,
    content_type: str,
    source: str,
    supabase: Client,
    github_branch: str | None = None,
) -> dict:
    """
    Inserts or updates a row in public.project_files.
    Uses ON CONFLICT (project_id, filename) DO UPDATE so re-uploading
    the same filename refreshes the record rather than creating a duplicate.
    Returns the upserted row.
    """
    payload = {
        "project_id":    project_id,
        "uploaded_by":   user_id,
        "filename":      filename,
        "storage_path":  storage_path,
        "size":          size,
        "content_type":  content_type,
        "source":        source,
        "github_branch": github_branch,
    }
    result = (
        supabase.table("project_files")
        .upsert(payload, on_conflict="project_id,filename")
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save file record to database",
        )
    return result.data[0]


def _db_row_to_response(row: dict, supabase: Client) -> ProjectFileResponse:
    """Converts a project_files DB row into a ProjectFileResponse with a fresh signed URL."""
    url = _make_signed_url(row["storage_path"], supabase)

    raw_ts = row.get("created_at") or ""
    try:
        uploaded_at = datetime.fromisoformat(raw_ts.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        uploaded_at = datetime.now(timezone.utc)

    return ProjectFileResponse(
        id=row["id"],
        name=row["filename"],
        size=row["size"],
        content_type=row["content_type"],
        path=row["storage_path"],
        url=url,
        uploaded_at=uploaded_at,
        uploaded_by=row.get("uploaded_by"),
        source=row["source"],
        github_branch=row.get("github_branch"),
    )


def _require_team_member_role(
    team_id: str,
    user_id: str,
    supabase: Client,
    allowed_roles: list[str],
) -> dict:
    """
    Fetches the user's team_members row and raises 403 if their role is not
    in `allowed_roles`. Returns the membership row on success.
    """
    result = (
        supabase.table("team_members")
        .select("role, branches")
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
    if result.data["role"] not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Only {' and '.join(allowed_roles)}s can import files from GitHub. "
                f"Your role is '{result.data['role']}'."
            ),
        )
    return result.data


def _check_developer_branch_access(membership: dict, branch: str) -> None:
    """
    For developers: enforces that the requested branch is in their assigned list.
    Admins bypass this check.
    """
    if membership["role"] != "developer":
        return  # admin — unrestricted

    assigned: list[str] = membership.get("branches") or []
    if not assigned:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No branches assigned to you. Ask your team admin to assign branches.",
        )
    if branch not in assigned:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"You only have access to: {', '.join(assigned)}. "
                f"Branch '{branch}' is not in your assigned list."
            ),
        )


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------

def list_project_files(
    project_id: str,
    user_id: str,
    supabase: Client,
) -> ProjectFileListResponse:
    """
    Lists all files for a project from the project_files table, newest first.
    Generates a fresh signed URL for each file.
    """
    _require_project_access(project_id, user_id, supabase)

    result = (
        supabase.table("project_files")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .execute()
    )

    files: List[ProjectFileResponse] = [
        _db_row_to_response(row, supabase)
        for row in (result.data or [])
    ]

    return ProjectFileListResponse(files=files)


async def upload_project_file(
    project_id: str,
    user_id: str,
    file: UploadFile,
    supabase: Client,
) -> ProjectFileResponse:
    """
    Validates and uploads a local file.
    1. Writes bytes to Supabase Storage.
    2. Upserts a row in project_files table.
    Returns the DB record with a fresh signed URL.
    """
    project  = _require_project_access(project_id, user_id, supabase)
    filename = (file.filename or "").strip()

    if not filename:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Filename cannot be empty",
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the 10 MB size limit ({len(content):,} bytes uploaded)",
        )
    if len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cannot upload an empty file",
        )

    _validate_extension(filename, project.get("language"))

    ext = os.path.splitext(filename)[1].lower()
    if ext == ".zip":
        rows: list[dict] = []
        allowed = ALLOWED_EXTENSIONS.get(project.get("language") or "", [])
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as archive:
                for entry in archive.infolist():
                    if entry.is_dir():
                        continue
                    inner_name = os.path.basename(entry.filename.replace("\\", "/"))
                    if not inner_name:
                        continue
                    inner_ext = os.path.splitext(inner_name)[1].lower()
                    if inner_ext not in allowed:
                        continue
                    inner_content = archive.read(entry)
                    if not inner_content or len(inner_content) > MAX_FILE_SIZE_BYTES:
                        continue
                    path = _storage_path(project_id, inner_name)
                    _upload_bytes(path, inner_content, "text/plain", supabase)
                    rows.append(
                        _upsert_db_record(
                            project_id=project_id,
                            user_id=user_id,
                            filename=inner_name,
                            storage_path=path,
                            size=len(inner_content),
                            content_type="text/plain",
                            source=FILE_SOURCE_LOCAL,
                            supabase=supabase,
                        )
                    )
        except zipfile.BadZipFile:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid ZIP archive",
            )
        if not rows:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="ZIP archive did not contain any files allowed by this project's language.",
            )
        return _db_row_to_response(rows[0], supabase)

    content_type = file.content_type or "application/octet-stream"
    path = _storage_path(project_id, filename)
    _upload_bytes(path, content, content_type, supabase)
    row = _upsert_db_record(
        project_id=project_id,
        user_id=user_id,
        filename=filename,
        storage_path=path,
        size=len(content),
        content_type=content_type,
        source=FILE_SOURCE_LOCAL,
        supabase=supabase,
    )
    return _db_row_to_response(row, supabase)


async def import_github_file(
    project_id: str,
    user_id: str,
    body: GitHubImportRequest,
    supabase: Client,
) -> ProjectFileResponse:
    """
    Imports a single file from the team's connected GitHub repository.

    Access rules:
      - Project must be a team project with a connected GitHub repo.
      - Only admins and developers can import.
      - Developers may only import from their assigned branches.
      - File extension must match the project's language.

    Flow:
      1. Validate project access + team membership + branch access.
      2. Fetch raw file content from GitHub via the installation token.
      3. Validate extension.
      4. Write bytes to Supabase Storage.
      5. Upsert row in project_files table.
    """
    # ── 1. Project access + team context ────────────────────────────────
    project = _require_project_access(project_id, user_id, supabase)

    team_id = project.get("team_id")
    if not team_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This project is not linked to a team. GitHub import is only available for team projects.",
        )

    # ── 2. Role check: admin or developer only ───────────────────────────
    membership = _require_team_member_role(
        team_id, user_id, supabase, allowed_roles=["admin", "developer"]
    )

    # ── 3. Branch access: developers restricted to assigned branches ─────
    _check_developer_branch_access(membership, body.branch)

    # ── 4. Fetch team's GitHub installation token ────────────────────────
    team_row = (
        supabase.table("teams")
        .select("github_repo, github_installation_id")
        .eq("id", team_id)
        .single()
        .execute()
    )
    if not team_row.data or not team_row.data.get("github_repo"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No GitHub repository connected to this team.",
        )

    installation_id = team_row.data.get("github_installation_id")
    if not installation_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub App not installed for this team. Reconnect GitHub first.",
        )

    # ── 5. Get installation token ────────────────────────────────────────
    from app.services.teams.github_service import _get_installation_token, _parse_github_owner_repo

    token = await _get_installation_token(installation_id)

    # ── 6. Validate file extension before hitting GitHub ─────────────────
    filename = os.path.basename(body.file_path)
    _validate_extension(filename, project.get("language"))

    # ── 7. Fetch file content from GitHub ────────────────────────────────
    repo_url = team_row.data["github_repo"]
    owner, repo = _parse_github_owner_repo(repo_url)

    import httpx
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/contents/{body.file_path}",
            headers=headers,
            params={"ref": body.branch},
        )

    if resp.status_code == 404:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File '{body.file_path}' not found on branch '{body.branch}'",
        )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"GitHub API error: {resp.status_code}",
        )

    data = resp.json()
    raw_b64: str = data.get("content", "")
    try:
        content = base64.b64decode(raw_b64)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not decode file content from GitHub",
        )

    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the 10 MB size limit ({len(content):,} bytes)",
        )

    # ── 8. Write bytes to storage ────────────────────────────────────────
    content_type = "text/plain"
    path = _storage_path(project_id, filename)
    _upload_bytes(path, content, content_type, supabase)

    # ── 9. Persist metadata to DB ────────────────────────────────────────
    row = _upsert_db_record(
        project_id=project_id,
        user_id=user_id,
        filename=filename,
        storage_path=path,
        size=len(content),
        content_type=content_type,
        source=FILE_SOURCE_GITHUB,
        supabase=supabase,
        github_branch=body.branch,
    )

    return _db_row_to_response(row, supabase)


def delete_project_file(
    project_id: str,
    filename: str,
    user_id: str,
    supabase: Client,
) -> ProjectFileDeleteResponse:
    """
    Deletes a file from both Supabase Storage and the project_files table.
    Owner only.
    """
    _require_project_owner(project_id, user_id, supabase)

    path = _storage_path(project_id, filename)

    # 1. Remove from storage
    supabase.storage.from_(STORAGE_BUCKET).remove([path])

    # 2. Remove from DB
    supabase.table("project_files").delete().eq("project_id", project_id).eq("filename", filename).execute()

    return ProjectFileDeleteResponse(deleted=filename)
